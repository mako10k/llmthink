#!/usr/bin/env node
import { CompletionItemKind, DocumentHighlightKind, DiagnosticSeverity, DidChangeConfigurationNotification, Location, MarkupKind, Position, ProposedFeatures, Range, SymbolKind, TextEdit, TextDocumentSyncKind, createConnection, } from "vscode-languageserver/node.js";
import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { EDGE_CONFIDENCE_KEYWORDS, SOURCE_CONFIDENCE_KEYWORDS, assertDslqlFunctionImplementationCoverage, auditDslText, collectDslqlReferences, collectDocumentDeclarations, DSLQL_FUNCTION_SPECS, formatDslText, ParseError, parseDocument, } from "@llmthink/core";
import { buildCodeActions } from "./code-actions.js";
import { buildContextualDslCompletions, buildDslqlCompletionItems, isDslqlQueryPosition, } from "./completions.js";
import { DEFAULT_LSP_DIAGNOSTIC_SETTINGS, normalizeLspDiagnosticSettings, resolveLspDiagnosticSeverity, } from "./diagnostics.js";
function confidenceReferenceIds(confidence) {
    if (confidence.kind === "edge") {
        return [confidence.sourceId, confidence.targetId];
    }
    return [
        confidence.kind === "source" ? confidence.sourceId : confidence.targetId,
    ];
}
function confidenceSymbolName(confidence) {
    if (confidence.kind === "edge") {
        return `${confidence.sourceId} -> ${confidence.targetId}`;
    }
    return confidence.kind === "source"
        ? confidence.sourceId
        : confidence.targetId;
}
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let hasConfigurationCapability = false;
let fallbackDiagnosticSettings = DEFAULT_LSP_DIAGNOSTIC_SETTINGS;
const KEYWORD_DOCS = {
    framework: "文書全体の制約や期待役割を宣言します。",
    domain: "評価対象の分類軸や対象領域を定義します。",
    problem: "検討対象の問題文を定義します。",
    annotation: "problem と premise / evidence / decision / comparison / pending に付く構造化注釈を宣言します。kind は閉じた集合で、詳細は `dsl help syntax annotations` を辿れます。",
    explanation: "annotation kind です。補足説明を表します。",
    rationale: "annotation kind です。判断理由や背景説明を表します。",
    status: "annotation kind です。要素の状態を表します。rejected、negated、superseded などを使います。",
    caveat: "annotation kind です。注意点や制約を表します。",
    todo: "annotation kind です。後続作業や未完了事項を表します。",
    orphan_future: "annotation kind です。将来扱う intentional orphan を表します。",
    orphan_reference: "annotation kind です。参照用に残す intentional orphan を表します。",
    step: "1 つの推論ステップを表します。",
    premise: "前提を表す step body です。",
    viewpoint: "評価軸を表す step body です。",
    axis: "viewpoint や partition の軸名を示します。",
    partition: "MECE 分割候補を表す step body です。",
    evidence: "根拠を表す step body です。必須本文の後に匿名 resource block を 0 個以上持てます。",
    resource: "evidence 本文を補足する匿名 provenance block です。url / file / blob の locator をちょうど 1 つ持ちます。",
    url: "evidence resource の absolute HTTP/HTTPS locator です。",
    file: "evidence resource の source に記録する file path locator です。通常 audit は file を読みません。",
    blob: "evidence resource の sha256 content identity locator です。",
    digest: "url / file resource に付ける任意の sha256 integrity digest です。",
    mime: "evidence resource に付ける parameter なしの MIME metadata claim です。",
    label: "evidence resource に付ける空でない表示用 label です。identity には使いません。",
    decision: "判断を表す step body です。",
    comparison: "同一 problem / viewpoint 内で decision 同士の相対比較を表す step body です。",
    based_on: "decision の参照根拠を列挙します。declared problem id と statement id を参照できます。",
    relation: "comparison header で使う比較関係です。値は preferred_over / weaker_than / incomparable / counterexample_to の閉じた集合です。",
    preferred_over: "comparison relation です。左側 decision を右側より優先します。",
    weaker_than: "comparison relation です。左側 decision が右側より弱いことを表します。",
    incomparable: "comparison relation です。2 つの decision を同一軸では順序付けしないことを表します。",
    counterexample_to: "comparison relation です。左側 decision が右側 decision の反例や反証になることを表します。",
    pending: "未解決事項を表す step body です。",
    confidence: "入力端または明示 scoring edge の信頼度評価を宣言します。数値区間と epistemic tag は別軸です。",
    declared_confidence: "decisionの自己申告confidenceを派生値と別に宣言します。派生値を上書きせず、区間との関係を監査します。",
    estimate: "confidence の有理数代表値です。0/1 から 1/1 の範囲で指定します。",
    range: "confidence の有理数区間です。lower..upper 形式で estimate を包含させます。",
    epistemic: "confidence 数値の認識状態です。known / estimated / unknown のいずれかを指定します。",
    known: "confidence の評価値と区間が明示的に確定した認識状態です。",
    estimated: "confidence に明示的な推定または幅がある認識状態です。",
    unknown: "confidence に未評価要素がある認識状態です。数値を消去せず、直交タグとして伝搬します。",
    default: "support-trace-v1 の幅付き既定値を使います。既定評価済みの事実を意味しません。",
    keyword: "support-trace-v1 の版付きキーワードを数値区間と epistemic tag へ展開します。source と edge は別の語彙です。",
    ...Object.fromEntries(SOURCE_CONFIDENCE_KEYWORDS.map((label) => [
        label,
        `support-trace-v1 の source confidence keyword '${label}' です。`,
    ])),
    ...Object.fromEntries(EDGE_CONFIDENCE_KEYWORDS.map((label) => [
        label,
        `support-trace-v1 の edge confidence keyword '${label}' です。`,
    ])),
    query: "DSL 文書に対する問い合わせを宣言します。",
    requires: "framework が要求する役割を表します。",
    forbids: "framework が禁止する要素を表します。",
    warns: "framework が注意喚起する要素を表します。",
};
const QUERY_FUNCTION_DOCS = Object.fromEntries(DSLQL_FUNCTION_SPECS.map((entry) => [entry.name, entry.summary]));
const DSLQL_IDENTIFIER_DOCS = {
    document: "document AST view です。framework、domains、problems、steps、confidence、confidence_results、queries を持ちます。",
    framework: "framework 宣言の root です。",
    domains: "domain 一覧の root stream です。",
    problems: "problem 一覧の root stream です。",
    steps: "step AST 一覧です。statement は各 step の .statement にあります。",
    queries: "query 一覧の root stream です。",
    confidence: "明示された confidence 宣言の root stream です。",
    confidence_results: "support-trace-v1 で計算した confidence 結果の root stream です。",
    estimate: "confidence assessment の正確な有理数字列です。",
    lower: "confidence assessment の区間下限です。",
    upper: "confidence assessment の区間上限です。",
    epistemic_tag: "confidence assessment の known / estimated / unknown 認識状態です。",
    profile_id: "confidence 計算規則の versioned profile ID です。",
    keyword_id: "origin=keyword の confidence assessment を展開した profile keyword ID です。",
    weakest_path: "派生 confidence の代表的な最弱経路です。",
    aggregation: "複数親の依存関係が未解決で、confidenceが保守的baselineであることを表します。",
    baseline_method: "複数親confidenceの保守的baseline計算方式です。現行値はcoordinate_minです。",
    boost_applied: "複数経路による信頼度上昇を適用したかを表します。",
    boosted_estimate: "複数経路を厳密合成した推定値です。依存関係未解決の場合はnullです。",
    unresolved_nodes: "依存関係未解決の複数親nodeとparent数を保持し、下流resultへ伝搬します。",
    parent_count: "未解決aggregation nodeのincoming scoring parent数です。",
    declared_assessment: "decision作者が自己申告したconfidence assessmentです。derived assessmentを上書きしません。",
    declared_comparison: "自己申告estimateがderived intervalの下、内側、上のどこにあるかを表します。",
    relation: "declared confidenceとderived intervalの位置関係です。",
    cause_ids: "known でない confidence 要因の ID 一覧です。",
    reasons: "confidence が計算不能な場合の理由一覧です。",
    audit: "latest audit result の root です。",
    thought: "thought metadata の root です。",
    search: "thought search result の root stream です。",
    id: "識別子 field です。problem、statement、query などで使われます。",
    role: "statement role field です。decision、evidence、pending などを表します。",
    text: "本文 text field です。problem や statement の説明に使われます。",
    based_on: "decision の参照 ID 一覧 field です。",
    statement: "step が所有する statement AST です。",
    node: "semantic match が保持する元の候補 node です。",
    score: "search result や query projection で使う score field です。",
    provider: "semantic match を生成した embedding provider です。",
    model: "semantic match を生成した embedding model です。",
    node_kind: "document AST node の構造種別 field です。",
    resources: "evidence が持つ source 順の匿名 resource 一覧です。各要素は宣言 ID を持ちません。",
    locator_kind: "evidence resource locator の url / file / blob tag です。",
    locator: "evidence resource の locator value です。",
    digest: "evidence resource の sha256 integrity digest または null です。",
    mime: "evidence resource の MIME metadata claim または null です。",
    label: "evidence resource の表示用 label または null です。",
};
const DSLQL_COMPLETIONS = [
    {
        label: ".document.problems[]",
        detail: "DSLQL root",
        documentation: "problem 一覧を stream として展開します。",
        insertText: ".document.problems[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.framework",
        detail: "DSLQL root",
        documentation: "framework AST にアクセスします。",
        insertText: ".document.framework",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.domains[]",
        detail: "DSLQL root",
        documentation: "domain AST 一覧を stream として展開します。",
        insertText: ".document.domains[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.steps[]",
        detail: "DSLQL root",
        documentation: "step AST 一覧を stream として展開します。",
        insertText: ".document.steps[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.steps[].statement",
        detail: "DSLQL root",
        documentation: "step AST 配下の statement 一覧を stream として展開します。",
        insertText: ".document.steps[].statement",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.steps[].statement.resources[]",
        detail: "DSLQL evidence resource stream",
        documentation: "evidence statement の匿名 resource 一覧を source 順に展開します。",
        insertText: ".document.steps[].statement.resources[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.queries[]",
        detail: "DSLQL root",
        documentation: "query 一覧を stream として展開します。",
        insertText: ".document.queries[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.confidence[]",
        detail: "DSLQL confidence declarations",
        documentation: "明示された confidence 宣言を source 順に展開します。",
        insertText: ".document.confidence[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".document.confidence_results[]",
        detail: "DSLQL derived confidence results",
        documentation: "support-trace-v1 で計算した区間、epistemic tag、原因または計算不能理由を展開します。",
        insertText: ".document.confidence_results[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".audit",
        detail: "DSLQL root",
        documentation: "latest audit result にアクセスします。",
        insertText: ".audit",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".thought",
        detail: "DSLQL root",
        documentation: "thought metadata にアクセスします。",
        insertText: ".thought",
        kind: CompletionItemKind.Field,
    },
    {
        label: ".search[]",
        detail: "DSLQL root",
        documentation: "thought search result を stream として展開します。",
        insertText: ".search[]",
        kind: CompletionItemKind.Field,
    },
    {
        label: "select(...)",
        detail: "DSLQL filter",
        documentation: QUERY_FUNCTION_DOCS.select,
        insertText: 'select(${1:.role == "decision"})',
        kind: CompletionItemKind.Function,
    },
    {
        label: "map(...)",
        detail: "DSLQL transform",
        documentation: QUERY_FUNCTION_DOCS.map,
        insertText: "map(${1:{id: .id, text: .text}})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "sort_by(...)",
        detail: "DSLQL transform",
        documentation: QUERY_FUNCTION_DOCS.sort_by,
        insertText: "sort_by(${1:.id})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "unique_by(...)",
        detail: "DSLQL transform",
        documentation: QUERY_FUNCTION_DOCS.unique_by,
        insertText: "unique_by(${1:.id})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "limit(...)",
        detail: "DSLQL transform",
        documentation: QUERY_FUNCTION_DOCS.limit,
        insertText: "limit(${1:10})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "related_decisions()",
        detail: "DSLQL relation",
        documentation: QUERY_FUNCTION_DOCS.related_decisions,
        insertText: "related_decisions()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "audit_findings(...)",
        detail: "DSLQL relation",
        documentation: QUERY_FUNCTION_DOCS.audit_findings,
        insertText: 'audit_findings(${1:"warning"})',
        kind: CompletionItemKind.Function,
    },
    {
        label: "len()",
        detail: "DSLQL helper",
        documentation: QUERY_FUNCTION_DOCS.len,
        insertText: "len(${1})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "contains(...)",
        detail: "DSLQL predicate",
        documentation: QUERY_FUNCTION_DOCS.contains,
        insertText: 'contains(${1:"value"})',
        kind: CompletionItemKind.Function,
    },
    {
        label: "starts_with(...)",
        detail: "DSLQL predicate",
        documentation: QUERY_FUNCTION_DOCS.starts_with,
        insertText: 'starts_with(${1:"prefix"})',
        kind: CompletionItemKind.Function,
    },
    {
        label: "ends_with(...)",
        detail: "DSLQL predicate",
        documentation: QUERY_FUNCTION_DOCS.ends_with,
        insertText: 'ends_with(${1:"suffix"})',
        kind: CompletionItemKind.Function,
    },
    {
        label: "based_on_refs()",
        detail: "DSLQL relation",
        documentation: QUERY_FUNCTION_DOCS.based_on_refs,
        insertText: "based_on_refs()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "upstream()",
        detail: "DSLQL relation",
        documentation: QUERY_FUNCTION_DOCS.upstream,
        insertText: "upstream()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "downstream()",
        detail: "DSLQL relation",
        documentation: QUERY_FUNCTION_DOCS.downstream,
        insertText: "downstream()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "has_open_pending()",
        detail: "DSLQL predicate",
        documentation: QUERY_FUNCTION_DOCS.has_open_pending,
        insertText: "has_open_pending()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "score()",
        detail: "DSLQL helper",
        documentation: QUERY_FUNCTION_DOCS.score,
        insertText: "score()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "kind()",
        detail: "DSLQL helper",
        documentation: QUERY_FUNCTION_DOCS.kind,
        insertText: "kind()",
        kind: CompletionItemKind.Function,
    },
    {
        label: "similarity(...)",
        detail: "DSLQL semantic score",
        documentation: QUERY_FUNCTION_DOCS.similarity,
        insertText: "similarity(., @${1:P1})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "similar_to(...)",
        detail: "DSLQL semantic predicate",
        documentation: QUERY_FUNCTION_DOCS.similar_to,
        insertText: "similar_to(., @${1:P1}, ${2:0.5})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "nearest_to(...)",
        detail: "DSLQL semantic rank",
        documentation: QUERY_FUNCTION_DOCS.nearest_to,
        insertText: "nearest_to(@${1:P1}, ${2:0.5})",
        kind: CompletionItemKind.Function,
    },
    {
        label: "query by problem",
        detail: "DSLQL snippet",
        documentation: "problem を起点に related_decisions を引く基本パターンです。",
        insertText: ".document.problems[] | select(.id == @${1:P1}) | related_decisions() | ${2:map({id: .id, text: .text})}",
        kind: CompletionItemKind.Snippet,
    },
    {
        label: "audit warnings",
        detail: "DSLQL snippet",
        documentation: "warning 以上の audit finding を束ねる基本パターンです。",
        insertText: '.audit | audit_findings("${1:warning}") | [.] | {count: len(.), findings: .}',
        kind: CompletionItemKind.Snippet,
    },
    {
        label: "semantic decisions",
        detail: "DSLQL snippet",
        documentation: "decision stream を宣言または自由文との embedding 類似度で順位付けします。",
        insertText: '.document.steps[].statement | select(.role == "decision") | nearest_to(@${1:P1}, ${2:0.5}) | limit(${3:10})',
        kind: CompletionItemKind.Snippet,
    },
];
assertDslqlFunctionImplementationCoverage(["core", "relation", "context", "semantic"], DSLQL_COMPLETIONS.filter((entry) => entry.kind === CompletionItemKind.Function)
    .map((entry) => /^([A-Za-z_][A-Za-z0-9_-]*)\(/.exec(entry.label)?.[1])
    .filter((name) => Boolean(name)));
function toRange(span, endColumn) {
    return {
        start: { line: span.line - 1, character: span.column - 1 },
        end: { line: span.line - 1, character: endColumn ?? span.column },
    };
}
function fullDocumentRange(document) {
    const lastLine = Math.max(document.lineCount - 1, 0);
    const lastLineText = lineTextAt(document, lastLine);
    return {
        start: Position.create(0, 0),
        end: Position.create(lastLine, lastLineText.length),
    };
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function lineTextAt(document, line) {
    return document.getText({
        start: Position.create(line, 0),
        end: Position.create(line + 1, 0),
    });
}
function identifierRangeOnLine(lineText, line, identifier, startCharacter = 0) {
    const pattern = new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "g");
    pattern.lastIndex = startCharacter;
    const match = pattern.exec(lineText);
    if (!match || match.index === undefined) {
        return undefined;
    }
    return Range.create(Position.create(line, match.index), Position.create(line, match.index + identifier.length));
}
function tokenizeRuleValue(value) {
    return value
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token && token !== "and" && token !== "or");
}
function createSymbolIndex() {
    return {
        definitions: new Map(),
        references: new Map(),
        semanticLocations: [],
    };
}
function addSemanticLocation(index, name, range) {
    index.semanticLocations.push({ name, range });
}
function addDefinition(index, uri, name, range) {
    if (!range) {
        return;
    }
    index.definitions.set(name, Location.create(uri, range));
    addSemanticLocation(index, name, range);
}
function addReference(index, uri, name, range) {
    if (!range || !index.definitions.has(name)) {
        return;
    }
    const references = index.references.get(name) ?? [];
    references.push(Location.create(uri, range));
    index.references.set(name, references);
    addSemanticLocation(index, name, range);
}
function addDefinitionAtSpan(index, document, name, span) {
    const line = span.line - 1;
    addDefinition(index, document.uri, name, identifierRangeOnLine(lineTextAt(document, line), line, name));
}
function addReferencesFromLine(index, document, line, identifiers) {
    const text = lineTextAt(document, line);
    let cursor = 0;
    for (const identifier of identifiers) {
        const range = identifierRangeOnLine(text, line, identifier, cursor);
        addReference(index, document.uri, identifier, range);
        if (range) {
            cursor = range.end.character;
        }
    }
}
function addDslqlReferences(index, document, query) {
    try {
        for (const reference of collectDslqlReferences(query.expression)) {
            const line = query.expressionSpan.line + reference.range.start.line - 2;
            const character = reference.range.start.line === 1
                ? query.expressionSpan.column + reference.range.start.column - 1
                : reference.range.start.column;
            const range = Range.create(Position.create(line, character), Position.create(line, character + reference.id.length));
            addReference(index, document.uri, reference.id, range);
        }
    }
    catch {
        // Parse diagnostics own invalid DSLQL. An incomplete query has no stable references.
    }
}
function buildSymbolIndex(document, ast) {
    const index = createSymbolIndex();
    for (const declaration of collectDocumentDeclarations(ast)) {
        addDefinitionAtSpan(index, document, declaration.id, declaration.span);
    }
    if (ast.framework) {
        for (const rule of ast.framework.rules) {
            addReferencesFromLine(index, document, rule.span.line - 1, tokenizeRuleValue(rule.value));
        }
    }
    for (const step of ast.steps) {
        if (step.statement.role === "decision") {
            addReferencesFromLine(index, document, step.statement.span.line - 1, step.statement.basedOn);
            continue;
        }
        if (step.statement.role === "partition") {
            addReferencesFromLine(index, document, step.statement.span.line - 1, [
                step.statement.domainName,
                step.statement.axis,
            ]);
            continue;
        }
        if (step.statement.role === "viewpoint") {
            addReferencesFromLine(index, document, step.statement.span.line, [
                step.statement.axis,
            ]);
        }
    }
    for (const confidence of ast.confidence) {
        addReferencesFromLine(index, document, confidence.span.line - 1, confidenceReferenceIds(confidence));
    }
    ast.queries.forEach((query) => addDslqlReferences(index, document, query));
    return index;
}
function positionInRange(position, range) {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line &&
        position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line &&
        position.character > range.end.character) {
        return false;
    }
    return true;
}
function symbolAtPosition(index, position) {
    return index.semanticLocations.find(({ range }) => positionInRange(position, range))?.name;
}
function parseIndexedDocument(document) {
    try {
        const ast = parseDocument(document.getText());
        return { ast, index: buildSymbolIndex(document, ast) };
    }
    catch {
        return undefined;
    }
}
function buildReferenceRanges(document) {
    const ranges = new Map();
    const add = (key, span, label) => {
        ranges.set(key, toRange(span, span.column - 1 + label.length));
    };
    if (document.framework) {
        add(document.framework.name, document.framework.span, document.framework.name);
    }
    for (const domain of document.domains) {
        add(domain.name, domain.span, domain.name);
    }
    for (const problem of document.problems) {
        add(problem.name, problem.span, problem.name);
    }
    for (const step of document.steps) {
        add(step.id, step.span, step.id);
        add(step.statement.id, step.statement.span, step.statement.id);
    }
    for (const query of document.queries) {
        add(query.id, query.span, query.id);
    }
    return ranges;
}
function metadataRange(textDocument, issue) {
    const line = Number(issue.metadata?.line);
    const column = Number(issue.metadata?.column);
    const endColumn = Number(issue.metadata?.end_column);
    const validLine = isPositiveFinite(line);
    const validColumn = isPositiveFinite(column);
    if (validLine && validColumn) {
        const lineText = lineTextAt(textDocument, line - 1);
        const resolvedEndColumn = Number.isFinite(endColumn) && endColumn > column ? endColumn : column + 1;
        return Range.create(Position.create(line - 1, Math.min(column - 1, lineText.length)), Position.create(line - 1, Math.min(resolvedEndColumn - 1, lineText.length)));
    }
    const unresolvedRef = issue.metadata?.unresolved_ref;
    if (validLine && typeof unresolvedRef === "string" && unresolvedRef) {
        return identifierRangeOnLine(lineTextAt(textDocument, line - 1), line - 1, unresolvedRef);
    }
    return undefined;
}
function isPositiveFinite(value) {
    return Number.isFinite(value) && value > 0;
}
async function validateTextDocument(textDocument) {
    const diagnostics = [];
    try {
        const settings = await diagnosticSettingsForDocument(textDocument.uri);
        const ast = parseDocument(textDocument.getText());
        const report = await auditDslText(textDocument.getText(), textDocument.uri, {
            embeddings: { provider: "none" },
        });
        const referenceRanges = buildReferenceRanges(ast);
        for (const issue of report.results) {
            const severity = resolveLspDiagnosticSeverity(issue, settings);
            if (severity === undefined) {
                continue;
            }
            const issueRange = metadataRange(textDocument, issue);
            diagnostics.push({
                range: issueRange ??
                    referenceRanges.get(issue.target_refs[0]?.ref_id ?? "") ??
                    Range.create(Position.create(0, 0), Position.create(0, 1)),
                severity,
                source: "llmthink",
                code: issue.category,
                message: [issue.message, issue.rationale, issue.suggestion]
                    .filter(Boolean)
                    .join("\n"),
            });
        }
    }
    catch (error) {
        if (error instanceof ParseError) {
            diagnostics.push({
                range: Range.create(Position.create(error.line - 1, Math.max(error.column - 1, 0)), Position.create(error.line - 1, Math.max(error.endColumn - 1, error.column))),
                severity: DiagnosticSeverity.Error,
                source: "llmthink",
                message: error.message,
            });
        }
        else {
            connection.console.error(String(error));
        }
    }
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
async function diagnosticSettingsForDocument(uri) {
    if (!hasConfigurationCapability) {
        return fallbackDiagnosticSettings;
    }
    try {
        const settings = await connection.workspace.getConfiguration({
            scopeUri: uri,
            section: "llmthink.diagnostics",
        });
        return normalizeLspDiagnosticSettings(settings);
    }
    catch {
        return DEFAULT_LSP_DIAGNOSTIC_SETTINGS;
    }
}
function symbolRange(span, name) {
    return Range.create(Position.create(span.line - 1, 0), Position.create(span.line - 1, name.length + 20));
}
function makeSymbol(name, kind, span, detail) {
    const range = symbolRange(span, name);
    return { name, detail, kind, range, selectionRange: range };
}
function stepBodySymbol(step) {
    const kind = (() => {
        switch (step.statement.role) {
            case "decision":
                return SymbolKind.EnumMember;
            case "comparison":
                return SymbolKind.Operator;
            case "evidence":
            case "premise":
                return SymbolKind.String;
            case "partition":
                return SymbolKind.Array;
            case "pending":
                return SymbolKind.Event;
            case "viewpoint":
                return SymbolKind.Interface;
        }
    })();
    return makeSymbol(step.statement.id, kind, step.statement.span, step.statement.role);
}
function buildDocumentSymbols(document) {
    const symbols = [];
    if (document.framework) {
        const framework = makeSymbol(document.framework.name, SymbolKind.Module, document.framework.span, "framework");
        framework.children = document.framework.rules.map((rule) => makeSymbol(`${rule.kind} ${rule.value}`, SymbolKind.Property, rule.span));
        symbols.push(framework);
    }
    symbols.push(...document.domains.map((domain) => makeSymbol(domain.name, SymbolKind.Namespace, domain.span, "domain")));
    symbols.push(...document.problems.map((problem) => makeSymbol(problem.name, SymbolKind.Object, problem.span, "problem")));
    symbols.push(...document.steps.map((step) => ({
        ...makeSymbol(step.id, SymbolKind.Method, step.span, step.statement.role),
        children: [stepBodySymbol(step)],
    })));
    symbols.push(...document.queries.map((query) => makeSymbol(query.id, SymbolKind.Function, query.span, "query")));
    symbols.push(...document.confidence.map((confidence) => makeSymbol(confidenceSymbolName(confidence), SymbolKind.Number, confidence.span, "confidence")));
    return symbols;
}
function getWordAtPosition(document, position) {
    const lineText = lineTextAt(document, position.line);
    const matches = [...lineText.matchAll(/[A-Za-z][A-Za-z0-9_-]*/g)];
    return matches.find((match) => {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        return position.character >= start && position.character <= end;
    })?.[0];
}
function buildHover(document, position) {
    const word = getWordAtPosition(document, position);
    if (!word) {
        return null;
    }
    const description = KEYWORD_DOCS[word] ??
        QUERY_FUNCTION_DOCS[word] ??
        DSLQL_IDENTIFIER_DOCS[word];
    if (!description) {
        return null;
    }
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: `**${word}**\n\n${description}`,
        },
    };
}
function buildRenameEdit(document, name, newName) {
    const parsed = parseIndexedDocument(document);
    const edits = [];
    if (!parsed) {
        return { changes: { [document.uri]: edits } };
    }
    const definition = parsed.index.definitions.get(name);
    if (definition) {
        edits.push(TextEdit.replace(definition.range, newName));
    }
    for (const reference of parsed.index.references.get(name) ?? []) {
        edits.push(TextEdit.replace(reference.range, newName));
    }
    return {
        changes: {
            [document.uri]: edits,
        },
    };
}
connection.onInitialize((params) => {
    hasConfigurationCapability = Boolean(params.capabilities.workspace?.configuration);
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentFormattingProvider: true,
            documentSymbolProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            renameProvider: { prepareProvider: true },
            documentHighlightProvider: true,
            codeActionProvider: true,
            hoverProvider: true,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [".", "|", "(", "["],
            },
        },
    };
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type);
    }
});
connection.onDidChangeConfiguration((change) => {
    if (!hasConfigurationCapability) {
        fallbackDiagnosticSettings = normalizeLspDiagnosticSettings(change.settings?.llmthink?.diagnostics);
    }
    for (const document of documents.all()) {
        void validateTextDocument(document);
    }
});
documents.onDidOpen((event) => {
    void validateTextDocument(event.document);
});
documents.onDidChangeContent((change) => {
    void validateTextDocument(change.document);
});
documents.onDidClose((event) => {
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});
connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    return [
        TextEdit.replace(fullDocumentRange(document), formatDslText(document.getText())),
    ];
});
connection.onDocumentSymbol((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const parsed = parseIndexedDocument(document);
    return parsed ? buildDocumentSymbols(parsed.ast) : [];
});
connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    const parsed = parseIndexedDocument(document);
    if (!parsed) {
        return null;
    }
    const name = symbolAtPosition(parsed.index, params.position);
    return name ? (parsed.index.definitions.get(name) ?? null) : null;
});
connection.onReferences((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const parsed = parseIndexedDocument(document);
    if (!parsed) {
        return [];
    }
    const name = symbolAtPosition(parsed.index, params.position);
    if (!name) {
        return [];
    }
    const references = parsed.index.references.get(name) ?? [];
    const definition = parsed.index.definitions.get(name);
    return params.context.includeDeclaration && definition
        ? [definition, ...references]
        : references;
});
connection.onPrepareRename((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    const parsed = parseIndexedDocument(document);
    if (!parsed) {
        return null;
    }
    const name = symbolAtPosition(parsed.index, params.position);
    if (!name) {
        return null;
    }
    const definition = parsed.index.definitions.get(name);
    return definition ? definition.range : null;
});
connection.onRenameRequest((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    const parsed = parseIndexedDocument(document);
    if (!parsed) {
        return null;
    }
    const name = symbolAtPosition(parsed.index, params.position);
    if (!name) {
        return null;
    }
    return buildRenameEdit(document, name, params.newName);
});
connection.onDocumentHighlight((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const parsed = parseIndexedDocument(document);
    if (!parsed) {
        return [];
    }
    const name = symbolAtPosition(parsed.index, params.position);
    if (!name) {
        return [];
    }
    const definition = parsed.index.definitions.get(name);
    const references = parsed.index.references.get(name) ?? [];
    const highlights = references.map((reference) => ({
        range: reference.range,
        kind: DocumentHighlightKind.Read,
    }));
    if (definition) {
        highlights.unshift({
            range: definition.range,
            kind: DocumentHighlightKind.Write,
        });
    }
    return highlights;
});
connection.onCodeAction(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    try {
        const ast = parseDocument(document.getText());
        const report = await auditDslText(document.getText(), document.uri, {
            embeddings: { provider: "none" },
        });
        return buildCodeActions(document, ast, report.results);
    }
    catch {
        return [];
    }
});
connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    return document ? buildHover(document, params.position) : null;
});
connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    const keywordItems = Object.entries(KEYWORD_DOCS).map(([label, documentation]) => ({
        label,
        kind: CompletionItemKind.Keyword,
        documentation,
    }));
    const queryItems = Object.entries(QUERY_FUNCTION_DOCS).map(([label, documentation]) => ({
        label,
        kind: CompletionItemKind.Function,
        documentation,
    }));
    if (document && isDslqlQueryPosition(document, params.position)) {
        return [...buildDslqlCompletionItems(DSLQL_COMPLETIONS), ...queryItems];
    }
    if (document) {
        const contextualItems = buildContextualDslCompletions(document, params.position, KEYWORD_DOCS);
        if (contextualItems?.length) {
            return contextualItems;
        }
    }
    return [...keywordItems, ...queryItems];
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map