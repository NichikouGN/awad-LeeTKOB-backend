import Parser from "web-tree-sitter";
import { fileURLToPath } from "node:url";

let language: Promise<Parser.Language> | undefined;
export async function parseCpp(source: string): Promise<Parser.Tree> {
  language ??= (async () => {
    await Parser.init();
    return Parser.Language.load(
      fileURLToPath(
        import.meta.resolve("tree-sitter-wasms/out/tree-sitter-cpp.wasm"),
      ),
    );
  })();
  const loaded = await language;
  const parser = new Parser();
  try {
    parser.setLanguage(loaded);
    parser.setTimeoutMicros(250_000);
    return parser.parse(source);
  } finally {
    parser.delete();
  }
}

export function nodes(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const result: Parser.SyntaxNode[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if (result.length >= 50_000) throw new Error("C++ syntax tree too large");
    result.push(node);
    stack.push(...node.namedChildren.slice().reverse());
  }
  return result;
}
