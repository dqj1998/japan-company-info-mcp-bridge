#!/usr/bin/env node
'use strict';

// MCP stdio proxy for the japan-company-info Free edition Orb.
//
// It launches the bundled `mcporb-runtime` binary in stdio-only mode and sits on
// the MCP JSON-RPC stream between the host (Claude Desktop, Cursor, Glama) and the
// runtime. On top of the runtime's generic `search_knowledge` tool it injects four
// domain-specific tools (financials / registry / shareholders / search); calls to
// them are normalized into a precise `search_knowledge` query and forwarded, so the
// runtime and the .orb stay completely generic. `search_knowledge` remains exposed
// as a fallback for open-ended questions. All retrieval runs locally.

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const RUNTIME_DIR = path.join(__dirname, 'bin');
const ORB_ZIP = path.join(__dirname, 'assets', 'japan-company-info-free.orb.zip');
const STORE_URL = 'https://mcporb.store/orb-pages/japan-company-info';

// English GAAP / IFRS term -> Japanese accounting term. Unknown terms pass through
// unchanged so the retrieval layer stays flexible (never blocks a novel query).
const GAAP_MAP = {
  revenue: '売上高',
  sales: '売上高',
  net_sales: '売上高',
  operating_income: '営業利益',
  operating_profit: '営業利益',
  operating_margin: '売上高営業利益率',
  ordinary_margin: '売上高経常利益率',
  equity_ratio: '自己資本比率',
  roe: '自己資本ROE',
  ordinary_income: '経常利益',
  net_income: '当期純利益',
  profit: '当期純利益',
  total_assets: '総資産',
  equity: '純資産',
  net_assets: '純資産',
  liabilities: '負債',
  cash_flow: 'キャッシュフロー',
  executive_compensation: '役員報酬',
};

function mapMetric(metric) {
  if (!metric) return '';
  const key = String(metric).trim().toLowerCase().replace(/\s+/g, '_');
  return GAAP_MAP[key] || String(metric).trim();
}

// Registry facet -> Japanese search term. Unknown values pass through.
const INFO_TYPE_MAP = {
  identity: '',
  address: '本社所在地',
  certifications: '認証',
  subsidies: '補助金',
  commendations: '表彰',
};

function mapInfoType(infoType) {
  if (!infoType) return '';
  const key = String(infoType).trim().toLowerCase();
  return key in INFO_TYPE_MAP ? INFO_TYPE_MAP[key] : String(infoType).trim();
}

// The four domain tools injected into tools/list. Descriptions are written to the
// TDQS six-axis rubric (Purpose / Behavioral transparency / Usage guidelines);
// inputSchema descriptions add meaning beyond the raw type.
const DOMAIN_TOOLS = [
  {
    name: 'edinet_financials_usgaap',
    description:
      'Retrieve official EDINET statutory financials (income statement, balance sheet, cash flow) and executive compensation for a Japanese listed company, with accounting concepts normalized across J-GAAP, US GAAP, and IFRS. ' +
      'Runs fully offline on the local machine — no data leaves the host; the requested metric is internally mapped to its Japanese accounting term before searching, and results return as ranked records (company name, 13-digit corporate number, fiscal year, and the requested line items with values in ¥ millions) sourced from 有価証券報告書 XBRL filings. ' +
      'This Free edition indexes 192 blue-chip companies, so a company outside that set returns the closest available matches rather than an error. ' +
      "Use this for a specific financial figure or statement of a named company (e.g. 'Toyota operating income 2023', '経常利益 in US GAAP'); use japan_company_search to discover an entity first, or japan_corporate_registry for identity and certification data. Identify the company by 13-digit corporate number or 4-digit securities code for the most reliable match; Japanese names resolve better than English.",
    inputSchema: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description:
            'Japanese or English company name, 13-digit corporate number, or 4-digit securities code. A 13-digit number or Japanese name resolves most reliably.',
        },
        metric: {
          type: 'string',
          description:
            "Financial metric, as an English GAAP term or a Japanese accounting term (e.g. 'operating_income', 'net_income', '経常利益'). Known English terms are mapped to Japanese automatically; unknown terms are searched as-is.",
        },
        fiscal_year: {
          type: 'integer',
          description: 'Fiscal year, e.g. 2023. Omit to retrieve the latest available year.',
        },
      },
      required: ['company_name'],
    },
  },
  {
    name: 'japan_corporate_registry',
    description:
      'Look up the official identity of a Japanese company: its 13-digit National Tax Agency corporate number, registered headquarters address, legal status, and METI gBizINFO certifications, subsidies, and commendations. ' +
      'Runs fully offline and returns the corporate number, registered name and address, status, and any gBizINFO records found, sourced from 法人番号公表サイト and gBizINFO; this Free edition covers 192 blue-chip companies, so out-of-set lookups return the nearest matches. ' +
      "Use this for KYB and entity-verification questions and for 'who or where is this company' lookups; use edinet_financials_usgaap for financial figures, or japan_company_search for fuzzy discovery. A 13-digit corporate number or an exact Japanese name gives the most reliable match.",
    inputSchema: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description:
            'Japanese or English company name, or 13-digit corporate number. A 13-digit number resolves most reliably.',
        },
        info_type: {
          type: 'string',
          description:
            "Which facet to focus on: 'identity', 'address', 'certifications', 'subsidies', or 'commendations'. Omit to retrieve all available registry information.",
        },
      },
      required: ['company_name'],
    },
  },
  {
    name: 'japan_shareholders',
    description:
      'Retrieve the major shareholders and ownership structure of a Japanese listed company from its EDINET 有価証券報告書 filing. ' +
      'Runs fully offline and returns a ranked list of top shareholders (name, shares held, ownership percentage) together with total shares outstanding, taken from the 大株主 section of the XBRL filing; this Free edition covers 192 blue-chip companies, so out-of-set companies return the nearest matches. ' +
      'Use this for ownership, cap-table, and cross-holding questions; use edinet_financials_usgaap for income-statement or balance-sheet figures, or japan_company_search to discover an entity first. Identify the company by 13-digit corporate number or 4-digit securities code for the most reliable match.',
    inputSchema: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description:
            'Japanese or English company name, 13-digit corporate number, or 4-digit securities code. A 13-digit number or Japanese name resolves most reliably.',
        },
        top_n: {
          type: 'integer',
          description: 'Number of top shareholders to return. Omit to default to 10.',
        },
      },
      required: ['company_name'],
    },
  },
  {
    name: 'japan_industry_benchmarks',
    description:
      'Retrieve sector-level financial benchmarks for Japanese industries from the 財務省 法人企業統計調査 (Ministry of Finance Corporate Enterprise Statistics Survey): operating margin (売上高営業利益率), ordinary margin (売上高経常利益率), equity ratio (自己資本比率), and ROE (自己資本ROE) by industry and data year. ' +
      'Runs fully offline and returns the benchmark row(s) for the requested industry with the available metrics and their data year, sourced from the Ministry of Finance survey via e-Stat; this Free edition includes a subset of industries. ' +
      "Use this to benchmark a company's profitability against its sector — pair it with edinet_financials_usgaap to pull the company's own figures, then compare. Provide the industry name, preferably the Japanese 業種 label (e.g. '輸送用機械器具製造業', '純粋持株会社').",
    inputSchema: {
      type: 'object',
      properties: {
        industry: {
          type: 'string',
          description:
            "Industry / sector name, preferably the Japanese 業種 label (e.g. '輸送用機械器具製造業', '情報通信業'). English sector names are searched as-is.",
        },
        metric: {
          type: 'string',
          description:
            "Optional benchmark metric to focus on: 'operating_margin', 'ordinary_margin', 'equity_ratio', or 'roe' (English or Japanese). Omit to return all available benchmark metrics.",
        },
      },
      required: ['industry'],
    },
  },
  {
    name: 'japan_company_search',
    description:
      'Search across Japanese corporate registries and listed-company filings by name, securities code, corporate number, or free-text intent — the entry point when the target company is unknown or ambiguous. ' +
      'Runs fully offline and returns ranked candidate companies (name, corporate number, securities code, and a snippet) ordered by relevance; this Free edition indexes 192 blue-chip companies. ' +
      "The 'vector' and 'hybrid' methods trigger a one-time ~220MB embedding-model download on first use, while 'bm25' and 'trigram' always work offline. " +
      "Use this to resolve an entity first (e.g. '半導体メーカー 東京', 'Tokyo semiconductor maker'), then call edinet_financials_usgaap, japan_shareholders, or japan_corporate_registry for details; 'trigram' suits codes and identifiers, 'hybrid' suits natural-language queries.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A company name, 4-digit securities code, 13-digit corporate number, or free-text intent describing the company you are looking for.',
        },
        method: {
          type: 'string',
          enum: ['auto', 'bm25', 'trigram', 'vector', 'hybrid'],
          description:
            "Retrieval method. 'auto' (default) picks the best available; 'bm25' exact keyword; 'trigram' fuzzy / identifier; 'vector' semantic (first use downloads the model); 'hybrid' fuses all rankers.",
        },
        top_k: {
          type: 'integer',
          description: 'Number of results to return. Omit to default to 5.',
        },
      },
      required: ['query'],
    },
  },
];

const DOMAIN_NAMES = new Set(DOMAIN_TOOLS.map((t) => t.name));

// Translate a domain-tool call into search_knowledge arguments. Pure string
// assembly + dictionary lookup — the hardcoded ancestor of the future Builder DSL.
function toSearchKnowledge(name, args) {
  args = args || {};
  const company = (args.company_name || '').toString().trim();
  switch (name) {
    case 'edinet_financials_usgaap': {
      const metric = mapMetric(args.metric);
      const year = args.fiscal_year != null ? String(args.fiscal_year) : '';
      const query = [company, metric, year, '有価証券報告書']
        .filter(Boolean)
        .join(' ');
      return { query, method: 'hybrid', top_k: 5 };
    }
    case 'japan_corporate_registry': {
      const info = mapInfoType(args.info_type);
      const query = [company, '法人番号 本社所在地', info].filter(Boolean).join(' ');
      const method = /^\d{13}$/.test(company) ? 'trigram' : 'hybrid';
      return { query, method, top_k: 3 };
    }
    case 'japan_shareholders': {
      const query = [company, '大株主 株主 持株比率 有価証券報告書']
        .filter(Boolean)
        .join(' ');
      const topN = Number.isInteger(args.top_n) ? args.top_n : 10;
      return { query, method: 'hybrid', top_k: Math.max(1, Math.min(topN, 20)) };
    }
    case 'japan_industry_benchmarks': {
      const industry = (args.industry || '').toString().trim();
      const metric = mapMetric(args.metric);
      const query = [
        industry,
        metric,
        '業種別 売上高営業利益率 売上高経常利益率 自己資本比率 法人企業統計調査',
      ]
        .filter(Boolean)
        .join(' ');
      return { query, method: 'hybrid', top_k: 3 };
    }
    case 'japan_company_search': {
      const out = { query: (args.query || '').toString() };
      if (args.method) out.method = args.method;
      if (args.top_k != null) out.top_k = args.top_k;
      return out;
    }
    default:
      return null;
  }
}

function resolveRuntime() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const specific = path.join(RUNTIME_DIR, `mcporb-runtime-${process.platform}-${process.arch}${ext}`);
  if (fs.existsSync(specific)) return specific;
  const generic = path.join(RUNTIME_DIR, `mcporb-runtime${ext}`);
  if (fs.existsSync(generic)) return generic;
  return null;
}

const bin = resolveRuntime();
if (!bin) {
  process.stderr.write(
    `[japan-company-info-mcp-bridge] No runtime binary for ${process.platform}-${process.arch}.\n` +
    `Bundled targets are listed in bin/. See README for building mcporb-runtime from source.\n`
  );
  process.exit(1);
}
if (!fs.existsSync(ORB_ZIP)) {
  process.stderr.write(`[japan-company-info-mcp-bridge] Missing Orb bundle: ${ORB_ZIP}\n`);
  process.exit(1);
}

const child = spawn(bin, ['--orb-zip', ORB_ZIP, '--stdio-only'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('error', (err) => {
  process.stderr.write(`[japan-company-info-mcp-bridge] Failed to start runtime: ${err.message}\n`);
  process.exit(1);
});

// Correlate requests we care about with their responses by JSON-RPC id.
const pendingToolsList = new Set();

function writeToChild(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}
function writeToHost(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// Host -> runtime: intercept tools/list (to augment its response) and domain
// tools/call (to rewrite into search_knowledge). Everything else passes through
// byte-for-byte.
const hostReader = readline.createInterface({ input: process.stdin });
hostReader.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    child.stdin.write(line + '\n');
    return;
  }

  if (msg && msg.method === 'tools/list' && msg.id != null) {
    pendingToolsList.add(String(msg.id));
    child.stdin.write(line + '\n');
    return;
  }

  if (
    msg &&
    msg.method === 'tools/call' &&
    msg.params &&
    DOMAIN_NAMES.has(msg.params.name)
  ) {
    const skArgs = toSearchKnowledge(msg.params.name, msg.params.arguments);
    const rewritten = {
      jsonrpc: msg.jsonrpc || '2.0',
      id: msg.id,
      method: 'tools/call',
      params: { name: 'search_knowledge', arguments: skArgs },
    };
    writeToChild(rewritten);
    return;
  }

  child.stdin.write(line + '\n');
});

// Propagate host EOF to the runtime so it can shut down cleanly.
hostReader.on('close', () => { try { child.stdin.end(); } catch (_) { /* already closed */ } });

// Runtime -> host: augment the tools/list response with the domain tools.
const childReader = readline.createInterface({ input: child.stdout });
childReader.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (_) {
    process.stdout.write(line + '\n');
    return;
  }

  if (msg && msg.id != null && pendingToolsList.has(String(msg.id))) {
    pendingToolsList.delete(String(msg.id));
    if (msg.result && Array.isArray(msg.result.tools)) {
      msg.result.tools = msg.result.tools.concat(DOMAIN_TOOLS);
      writeToHost(msg);
      return;
    }
  }

  process.stdout.write(line + '\n');
});

const forward = (sig) => { try { child.kill(sig); } catch (_) { /* already gone */ } };
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code == null ? 0 : code));
});
