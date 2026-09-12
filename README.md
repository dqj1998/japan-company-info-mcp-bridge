# Japan Company Info — MCP Server (Free Edition)

Verified **Japanese corporate data** for Claude, Cursor, and any MCP client — served locally
over stdio. Query **EDINET** statutory filings (XBRL 5-year financials), **National Tax Agency**
13-digit corporate numbers, major shareholders, and **gBizINFO** certifications/subsidies, with a
built-in **J-GAAP / US GAAP / IFRS** mapping dictionary.

This package is the **Free edition**: **192 large-cap blue-chip listed companies** (EDINET-listed).
The full dataset — **3,193+ listed companies** with complete XBRL financials, major shareholders,
gBizINFO details, and 財務省 法人企業統計調査 industry benchmarks — is available as a one-time
purchase at **[mcporb.store](https://mcporb.store/orb/japan-company-info)**.

> **Use cases:** cross-border equity analysis, KYB / due-diligence entity verification,
> M&A target screening, and reading Japanese filings in English without mistranslating
> 営業利益 (Operating Income) vs 経常利益 (Ordinary Income, a J-GAAP-only concept).

---

## How it works

The server bundles the `mcporb-runtime` binary and a pre-indexed Orb (BM25 + trigram +
optional dense-vector retrieval). **Retrieval runs on your machine.** On first launch the
runtime downloads its query-embedding model (~220MB) in the background to enable the
semantic `vector` method; until that finishes — and forever after, offline — the `bm25`,
`trigram`, and `auto` methods work without any network access. Your queries are not sent to
a third-party API by this server.

It exposes one tool:

- **`search_knowledge(query, method?, top_k?)`** — search the corporate knowledge base.
  `method` ∈ `auto` (default) · `bm25` (exact keyword) · `trigram` (fuzzy / identifier) ·
  `vector` (semantic) · `hybrid` (RRF fusion).

---

## Quick start

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "japan-company-info": {
      "command": "npx",
      "args": ["-y", "japan-company-info-mcp-bridge"]
    }
  }
}
```

(Before the package is published to npm, use the GitHub form:
`"args": ["-y", "github:dqj1998/japan-company-info-mcp-bridge"]`.)

### Cursor

Add the same server under **Settings → MCP → Add Server** (command `npx`, args as above).

### Local (from a clone)

```bash
npx .
```

---

## Example queries

Most reliable retrieval is by **corporate number** or **securities code** (exact identifiers),
then Japanese company name; English company-name search covers companies with an official
English name (best-effort otherwise).

| Intent | Example |
|---|---|
| By corporate number | `search_knowledge("1180301018771")` → Toyota Motor Corporation |
| By securities code | `search_knowledge("72030", method="trigram")` → Toyota Motor Corporation |
| By Japanese name | `search_knowledge("トヨタ自動車", method="hybrid")` |
| GAAP concept | `search_knowledge("経常利益はUS GAAPでどう表現するか")` |

> **Coverage note:** this Free edition indexes 192 blue-chip companies. Queries for companies
> outside that set return the closest available matches; unlock the full 3,193+ company dataset
> at [mcporb.store](https://mcporb.store/orb/japan-company-info).

---

## Data sources & attribution

- **法人番号公表サイト** (National Tax Agency) — corporate registration
- **EDINET** (Financial Services Agency) — 有価証券報告書 XBRL financials
- **gBizINFO** (METI) — certifications, subsidies, commendations
- **財務省 法人企業統計調査** — industry benchmarks (full edition)

Data is redistributed under each source's terms; see [NOTICE](NOTICE).

## License

Bridge **code** is MIT (see [LICENSE](LICENSE)). The bundled Orb data and `mcporb-runtime`
binary are **not** MIT — they are licensed separately; see [NOTICE](NOTICE).

**Keywords:** MCP · EDINET · Japanese GAAP · US GAAP · IFRS · Operating Income · Ordinary Income ·
Balance Sheet · Statutory Audit · Corporate Number · National Tax Agency · Due Diligence ·
Entity Verification · AML · KYB · gBizINFO · JSIC · Operating Margin · Industry Benchmark · Credit Risk
