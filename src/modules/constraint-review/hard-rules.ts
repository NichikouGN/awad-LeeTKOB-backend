import type Parser from "web-tree-sitter";
import type { ConstraintInput, ConstraintVerdict } from "./contract";
import { nodes, parseCpp } from "./cpp-parser";

type Node = Parser.SyntaxNode;
type Scope = {
  parent?: Scope;
  namespace: string;
  symbols: Map<string, string>;
  imports: string[];
};
const scopes = new Set([
  "translation_unit",
  "compound_statement",
  "namespace_definition",
  "function_definition",
  "class_specifier",
  "struct_specifier",
  "lambda_expression",
  "for_statement",
  "if_statement",
]);

function nameOf(node: Node | null): string {
  if (!node) return "";
  if (node.type === "qualified_identifier") {
    const scope = nameOf(node.childForFieldName("scope"));
    const name = nameOf(node.childForFieldName("name"));
    const qualified = scope ? `${scope}::${name}` : name;
    return node.children[0]?.type === "::" ? `::${qualified}` : qualified;
  }
  if (node.type.startsWith("template_"))
    return nameOf(node.childForFieldName("name"));
  if (node.type.endsWith("declarator"))
    return nameOf(node.childForFieldName("declarator"));
  return node.text.replace(/^::/, "");
}

function lookup(name: string, scope: Scope): string | undefined {
  for (
    let current: Scope | undefined = scope;
    current;
    current = current.parent
  ) {
    const found = current.symbols.get(name);
    if (found) return found;
  }
}

function resolve(name: string, scope: Scope): string {
  if (name.startsWith("::")) return name.slice(2);
  const [first, ...rest] = name.split("::");
  const symbol = lookup(first, scope);
  return [symbol ?? first, ...rest].join("::");
}

function snapshot(scope: Scope): Scope {
  const chain: Scope[] = [];
  for (
    let current: Scope | undefined = scope;
    current;
    current = current.parent
  ) {
    if (chain.length >= 128 || current.symbols.size > 512)
      throw new Error("C++ scope analysis limit");
    chain.push(current);
  }
  let copied: Scope | undefined;
  for (const current of chain.reverse())
    copied = {
      parent: copied,
      namespace: current.namespace,
      symbols: new Map(current.symbols),
      imports: [...current.imports],
    };
  if (!copied) throw new Error("Missing C++ scope");
  return copied;
}

function importedNamespaces(scope: Scope): string[] {
  const result: string[] = [];
  for (
    let current: Scope | undefined = scope;
    current;
    current = current.parent
  )
    result.push(...current.imports);
  return result;
}

function references(
  all: Node[],
): { name: string; line: number; scope: Scope }[] {
  const byNode = new Map<number, Scope>();
  const namedScopes = new Map<string, Scope>();
  const refs: { name: string; line: number; scope: Scope }[] = [];
  const root: Scope = { namespace: "", symbols: new Map(), imports: [] };
  for (const node of all) {
    let scope = (node.parent && byNode.get(node.parent.id)) || root;
    if (node.type === "namespace_definition") {
      const name = nameOf(node.childForFieldName("name"));
      if (name)
        scope.symbols.set(
          name,
          [scope.namespace, name].filter(Boolean).join("::"),
        );
    }
    if (node.type === "class_specifier" || node.type === "struct_specifier") {
      const name = nameOf(node.childForFieldName("name"));
      if (name)
        scope.symbols.set(name, `${scope.namespace || "@local"}::${name}`);
    }
    // A function/class name belongs to its enclosing scope, not its own body.
    if (
      [
        "function_definition",
        "declaration",
        "parameter_declaration",
        "init_declarator",
      ].includes(node.type)
    ) {
      const name = nameOf(node.childForFieldName("declarator"));
      if (/^[A-Za-z_]\w*$/.test(name))
        scope.symbols.set(
          name,
          scope.namespace ? `${scope.namespace}::${name}` : `@local::${name}`,
        );
    }
    if (scopes.has(node.type) && node.type !== "translation_unit") {
      let namespace = [
        "namespace_definition",
        "class_specifier",
        "struct_specifier",
      ].includes(node.type)
        ? [scope.namespace, nameOf(node.childForFieldName("name"))]
            .filter(Boolean)
            .join("::")
        : scope.namespace;
      if (node.type === "function_definition") {
        const declared = nameOf(node.childForFieldName("declarator"));
        if (declared.includes("::")) {
          namespace = resolve(declared, scope)
            .replace(/^@local::/, "")
            .split("::")
            .slice(0, -1)
            .join("::");
          scope = namedScopes.get(namespace) ?? scope;
        }
      }
      const priorNamespace =
        node.type === "namespace_definition" && namespace
          ? namedScopes.get(namespace)
          : undefined;
      scope = priorNamespace ?? {
        parent: scope,
        namespace,
        symbols: new Map(),
        imports: [],
      };
      if (
        [
          "namespace_definition",
          "class_specifier",
          "struct_specifier",
        ].includes(node.type) &&
        namespace
      )
        namedScopes.set(namespace, scope);
      // C++ member lookup sees the complete class, including members declared
      // later than an inline method. A namespace does not have this rule.
      if (node.type === "class_specifier" || node.type === "struct_specifier") {
        for (const member of node.childForFieldName("body")?.namedChildren ??
          []) {
          const declarations = [
            member.childForFieldName("declarator"),
            ...member.namedChildren.filter(
              (child) => child.type === "function_declarator",
            ),
          ];
          for (const declaration of declarations) {
            const name = nameOf(declaration);
            if (/^[A-Za-z_]\w*$/.test(name))
              scope.symbols.set(name, `${namespace}::${name}`);
          }
        }
      }
    }
    byNode.set(node.id, scope);
    if (node.type === "namespace_alias_definition") {
      const name = node.childForFieldName("name");
      const target = node.namedChildren.at(-1);
      if (name && target)
        scope.symbols.set(name.text, resolve(nameOf(target), scope));
    }
    if (node.type === "using_declaration") {
      const target = node.namedChildren.at(-1);
      if (target) {
        const name = resolve(nameOf(target), scope);
        if (node.children.some((child) => child.type === "namespace"))
          scope.imports.push(name);
        else scope.symbols.set(name.split("::").at(-1) ?? name, name);
      }
    }
    if (node.type === "qualified_identifier") {
      // Only the outermost qualified name represents a complete reference.
      if (node.parent?.type === "qualified_identifier") continue;
      if (
        ["using_declaration", "namespace_alias_definition"].includes(
          node.parent?.type ?? "",
        )
      )
        continue;
      refs.push({
        name: nameOf(node),
        line: node.startPosition.row + 1,
        scope: snapshot(scope),
      });
    } else if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier" || fn?.type === "template_function")
        refs.push({
          name: nameOf(fn),
          line: fn.startPosition.row + 1,
          scope: snapshot(scope),
        });
    } else if (
      ["template_function", "template_type", "type_identifier"].includes(
        node.type,
      ) &&
      node.parent?.type !== "template_type" &&
      node.parent?.type !== "qualified_identifier"
    ) {
      refs.push({
        name: nameOf(node),
        line: node.startPosition.row + 1,
        scope: snapshot(scope),
      });
    } else if (
      node.type === "identifier" &&
      [
        "argument_list",
        "return_statement",
        "pointer_expression",
        "assignment_expression",
      ].includes(node.parent?.type ?? "")
    ) {
      refs.push({
        name: nameOf(node),
        line: node.startPosition.row + 1,
        scope: snapshot(scope),
      });
    }
  }
  return refs;
}

export async function checkHardRules(
  sourceCode: string,
  constraints: ConstraintInput[],
): Promise<ConstraintVerdict[]> {
  const results: ConstraintVerdict[] = constraints.map((constraint) => ({
    constraint: constraint.id,
    verdict: "unsure",
    evidence: [],
    method: /^(Do not use|Do not call)\b/i.test(constraint.text.trim())
      ? "hard_rule"
      : "semantic",
    reason: "semantic-constraint",
  }));
  if (!results.some((result) => result.method === "hard_rule")) return results;
  let tree: Parser.Tree | undefined;
  try {
    if (Buffer.byteLength(sourceCode) > 65_536) throw new Error("source-limit");
    tree = await parseCpp(sourceCode);
    const all = nodes(tree.rootNode);
    const unsupported =
      tree.rootNode.hasError() ||
      all.some(
        (node) =>
          node.type.startsWith("preproc_") && node.type !== "preproc_include",
      );
    const refs = unsupported ? [] : references(all);
    const lines = sourceCode.split(/\r?\n/);
    for (const [index, constraint] of constraints.entries()) {
      const result = results[index];
      if (result.method !== "hard_rule") continue;
      const banned = [...constraint.text.matchAll(/`([^`]+)`/g)].map((match) =>
        match[1].replace(/\s/g, "").replace(/^::/, ""),
      );
      if (
        !banned.length ||
        banned.some((name) => !/^[A-Za-z_]\w*(::[A-Za-z_]\w*)*$/.test(name))
      ) {
        result.reason = "unsupported-ban-list";
        continue;
      }
      if (unsupported) {
        result.reason = "cpp-preprocessing-or-parse-unsupported";
        continue;
      }
      const evidenceLines = new Set<number>();
      let ambiguous = false;
      for (const ref of refs) {
        const resolved = resolve(ref.name, ref.scope);
        const candidates = [resolved];
        if (!ref.name.includes("::") && !lookup(ref.name, ref.scope)) {
          for (const ns of importedNamespaces(ref.scope))
            candidates.push(`${ns}::${ref.name}`);
          if (ref.scope.namespace)
            candidates.push(`${ref.scope.namespace}::${ref.name}`);
        }
        if (banned.some((name) => candidates.includes(name)))
          evidenceLines.add(ref.line);
        // Overload resolution between a local function and a using-directive
        // needs a compiler. Never infer a violation in that ambiguous case.
        if (
          !ref.name.includes("::") &&
          resolved.startsWith("@local::") &&
          banned.some((name) =>
            importedNamespaces(ref.scope).some(
              (ns) => `${ns}::${ref.name}` === name,
            ),
          )
        )
          ambiguous = true;
      }
      if (evidenceLines.size) {
        result.verdict = "violation";
        result.evidence = [...evidenceLines]
          .sort((a, b) => a - b)
          .map((line) => ({ line, text: lines[line - 1] }));
        delete result.reason;
      } else if (ambiguous) result.reason = "cpp-name-resolution-ambiguous";
      else {
        result.verdict = "pass";
        delete result.reason;
      }
    }
  } catch {
    for (const result of results) {
      if (result.method === "hard_rule")
        result.reason = "cpp-parser-unavailable";
    }
  } finally {
    tree?.delete();
  }
  return results;
}
