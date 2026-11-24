import type { ReviewInput } from "./contract";
import { nodes, parseCpp } from "./cpp-parser";

// Preserve line count so evidence can be validated against this exact sanitized
// source, then mapped back to the original source only inside the backend.
export async function sanitizeModelInput(input: ReviewInput) {
  if (Buffer.byteLength(input.sourceCode) > 65_536)
    throw new Error("source-limit");
  const tree = await parseCpp(input.sourceCode);
  let sourceCode = input.sourceCode;
  let targets: {
    start: number;
    end: number;
    text: string;
    literal: boolean;
  }[] = [];
  try {
    if (tree.rootNode.hasError()) throw new Error("cpp-sanitization-failed");
    const all = nodes(tree.rootNode);
    targets = all
      .filter((node) =>
        [
          "identifier",
          "field_identifier",
          "namespace_identifier",
          "type_identifier",
          "string_literal",
          "raw_string_literal",
          "char_literal",
          "number_literal",
          "preproc_arg",
        ].includes(node.type),
      )
      .map((node) => ({
        start: node.startIndex,
        end: node.endIndex,
        text: node.text,
        literal: [
          "string_literal",
          "raw_string_literal",
          "char_literal",
        ].includes(node.type),
      }));
    for (const comment of all
      .filter((node) => node.type === "comment")
      .reverse())
      sourceCode =
        sourceCode.slice(0, comment.startIndex) +
        comment.text.replace(/[^\r\n]/g, " ") +
        sourceCode.slice(comment.endIndex);
  } finally {
    tree.delete();
  }

  const identities = new Set<string>();
  for (const value of input.identityValues ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    identities.add(trimmed);
    const ascii = trimmed
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/gi, "d");
    identities.add(ascii);
    if (/\s/.test(ascii)) {
      identities.add(ascii.replace(/\s+/g, ""));
      identities.add(ascii.replace(/\s+/g, "_"));
      for (const part of trimmed.split(/\s+/))
        if (part.length >= 2) identities.add(part);
      for (const part of ascii.split(/\s+/))
        if (part.length >= 2) identities.add(part);
    }
    const id = trimmed.match(/^(\d{8})(?:@|$)/)?.[1];
    if (id) identities.add(id);
  }
  const replacements = [...identities]
    .sort((a, b) => b.length - a.length)
    .map((value, index) => ({
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}_])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
        "giu",
      ),
      value: `anon_${index + 1}`,
    }));
  const redact = (value: string) => {
    let result = value;
    for (const replacement of replacements)
      result = result.replace(replacement.pattern, replacement.value);
    return result.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "anon_email");
  };
  for (const target of targets.sort((a, b) => b.start - a.start)) {
    const replacement = target.literal
      ? redact(target.text).replace(/(?<!\d)\d{8}(?!\d)/g, "anon_student")
      : redact(target.text);
    sourceCode =
      sourceCode.slice(0, target.start) +
      replacement +
      sourceCode.slice(target.end);
  }
  return {
    statement: redact(input.statement),
    sourceCode,
    constraints: input.constraints.map((constraint) => ({
      id: redact(constraint.id),
      text: redact(constraint.text),
    })),
  };
}
