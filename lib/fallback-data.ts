// Hardcoded fallback responses, one per scripted demo query. Used:
//   - by the API route when retrieval throws or returns an empty subgraph
//   - by the page on first paint and when /api/ask fetch fails
// Each fallback mirrors the shape that the live route would return, so the
// UI render path stays uniform across live vs fallback.

import type { AskResponse, Graph } from "./types";
import { FLAT_CHUNKS_BY_INTENT } from "./flat-chunks";
import {
  approxTokens,
  serializeFlatContext,
  serializeGraphContext,
} from "./retrieval";
import graphData from "../data/graph.json";

const FALLBACK_GRAPH = graphData as Graph;

const FREELANCER_BFS_NODES = [
  "AVL-1",
  "AVL-65",
  "DEF-ELINK",
  "DEF-KTP",
  "EU-VAT-44",
  "OHJE-PALV-ULK",
  "OHJE-ALV-ILM",
  "KHO-2019-42",
  "AVL-66",
  "AVL-69",
  "AVL-63",
];

const FREELANCER_BFS_EDGES = [
  "e12", // AVL-65 EXCEPTION_TO AVL-1
  "e20", // AVL-65 USES_DEFINITION DEF-ELINK
  "e21", // AVL-65 USES_DEFINITION DEF-KTP
  "e30", // OHJE-PALV-ULK INTERPRETS AVL-65
  "e31", // OHJE-PALV-ULK INTERPRETS AVL-66
  "e32", // OHJE-PALV-ULK INTERPRETS DEF-ELINK
  "e36", // OHJE-ALV-ILM INTERPRETS AVL-65
  "e46", // KHO-2019-42 RULED_ON AVL-65
  "e47", // KHO-2019-42 RULED_ON DEF-ELINK
  "e56", // AVL-65 IMPLEMENTS EU-VAT-44
  "e13", // AVL-66 EXCEPTION_TO AVL-65
  "e14", // AVL-69 EXCEPTION_TO AVL-65
  "e18", // AVL-65 CITES AVL-63
];

const VEHICLE_BFS_NODES = [
  "AVL-102",
  "AVL-114",
  "AVL-114a",
  "DEF-HENKAUTO",
  "DEF-PAKKARI",
  "DEF-EDUSTUS",
  "OHJE-HENKAUTO-ALV",
  "KHO-2017-31",
  "EU-VAT-176",
];

const VEHICLE_BFS_EDGES = [
  "e15", // AVL-114 EXCEPTION_TO AVL-102
  "e16", // AVL-114a EXCEPTION_TO AVL-114
  "e26", // AVL-114a USES_DEFINITION DEF-HENKAUTO
  "e27", // AVL-114 USES_DEFINITION DEF-EDUSTUS
  "e38", // OHJE-HENKAUTO-ALV INTERPRETS AVL-114a
  "e39", // OHJE-HENKAUTO-ALV INTERPRETS AVL-114
  "e40", // OHJE-HENKAUTO-ALV INTERPRETS DEF-HENKAUTO
  "e41", // OHJE-HENKAUTO-ALV INTERPRETS DEF-PAKKARI
  "e50", // KHO-2017-31 RULED_ON AVL-114
  "e51", // KHO-2017-31 RULED_ON DEF-PAKKARI
  "e58", // AVL-114 IMPLEMENTS EU-VAT-176
];

const ENTERTAINMENT_BFS_NODES = [
  "AVL-102",
  "AVL-114",
  "EVL-8",
  "DEF-EDUSTUS",
  "DEF-HENKILOKUNTA",
  "OHJE-EDUSTUS",
  "KHO-2018-91",
  "EU-VAT-176",
];

const ENTERTAINMENT_BFS_EDGES = [
  "e15", // AVL-114 EXCEPTION_TO AVL-102
  "e27", // AVL-114 USES_DEFINITION DEF-EDUSTUS
  "e28", // EVL-8 USES_DEFINITION DEF-EDUSTUS
  "e29", // EVL-8 USES_DEFINITION DEF-HENKILOKUNTA
  "e42", // OHJE-EDUSTUS INTERPRETS EVL-8
  "e43", // OHJE-EDUSTUS INTERPRETS AVL-114
  "e44", // OHJE-EDUSTUS INTERPRETS DEF-EDUSTUS
  "e45", // OHJE-EDUSTUS INTERPRETS DEF-HENKILOKUNTA
  "e52", // KHO-2018-91 RULED_ON EVL-8
  "e53", // KHO-2018-91 RULED_ON DEF-HENKILOKUNTA
  "e54", // KHO-2018-91 RULED_ON DEF-EDUSTUS
  "e58", // AVL-114 IMPLEMENTS EU-VAT-176
];

export const QUERIES: Record<
  string,
  { label: string; question: string; intentId: string }
> = {
  "freelancer-b2b-vat": {
    intentId: "freelancer-b2b-vat",
    label: "Reverse charge B2B",
    question:
      "When must a business-to-business service supplied across borders be invoiced with reverse charge VAT, and what mandatory invoice wording and documentation are typically required?",
  },
  "vehicle-input-vat": {
    intentId: "vehicle-input-vat",
    label: "Vehicle input VAT",
    question:
      "Under what conditions is input VAT on passenger cars and vans deductible when the vehicles are partly used for private driving, including company cars, pickup trucks, and service vans driven between home and customer sites?",
  },
  "entertainment-deductibility": {
    intentId: "entertainment-deductibility",
    label: "Alcohol & entertainment",
    question:
      "To what extent are alcohol costs incurred at staff parties, internal meetings, and client dinners deductible for corporate income tax and input VAT purposes, and how should such expenses be classified between staff welfare, representation, and non-deductible costs?",
  },
};

export const FALLBACK_DATA_BY_INTENT: Record<string, AskResponse> = {
  "freelancer-b2b-vat": {
    query: QUERIES["freelancer-b2b-vat"].question,
    intent: "freelancer-b2b-vat",
    answer:
      "For a cross-border B2B service, reverse charge applies under AVL § 65: the place of supply is the buyer's country when the buyer is a business (elinkeinonharjoittaja) established in another EU/EEA state. The Finnish seller invoices with VAT 0 % and must include the wording 'reverse charge, Article 44 VAT Directive', the buyer's valid VAT identification number, and a description identifying the service. The sale is reported on the VAT return under 'palvelujen myynnit muihin EU-maihin'. Required documentation: an invoice meeting AVL § 209 a, evidence that the buyer is a business (VAT ID verified via VIES), and the customer's business status recorded in the seller's records.",
    citations: [
      {
        node_id: "AVL-65",
        label: "AVL § 65",
        snippet:
          "Elinkeinonharjoittajalle luovutettu palvelu on myyty Suomessa, jos se luovutetaan ostajan täällä sijaitsevaan kiinteään toimipaikkaan…",
      },
      {
        node_id: "OHJE-PALV-ULK",
        label: "Palvelujen ulkomaankaupan ALV",
        snippet:
          "Elinkeinonharjoittajien välisessä palvelukaupassa pääsääntönä on, että palvelu verotetaan ostajan sijoittautumisvaltiossa…",
      },
      {
        node_id: "KHO-2019-42",
        label: "KHO:2019:42",
        snippet:
          "Suomalainen yhtiö myi konsultointipalveluja saksalaiselle elinkeinonharjoittajalle…",
      },
      {
        node_id: "EU-VAT-44",
        label: "VAT Directive Art. 44",
        snippet:
          "Place of supply of services to a taxable person acting as such shall be the place where that person has established his business.",
      },
    ],
    path: [
      {
        from: "AVL-65",
        to: "AVL-1",
        edge: "EXCEPTION_TO",
        rationale:
          "AVL § 65 is a specific rule overriding the general rule in AVL § 1.",
      },
      {
        from: "AVL-65",
        to: "DEF-ELINK",
        edge: "USES_DEFINITION",
        rationale:
          "AVL § 65 relies on the definition of Elinkeinonharjoittaja.",
      },
      {
        from: "AVL-65",
        to: "EU-VAT-44",
        edge: "IMPLEMENTS",
        rationale: "AVL § 65 implements VAT Directive Art. 44.",
      },
      {
        from: "OHJE-PALV-ULK",
        to: "AVL-65",
        edge: "INTERPRETS",
        rationale:
          "Palvelujen ulkomaankaupan ALV provides Vero guidance on how to apply AVL § 65.",
      },
      {
        from: "KHO-2019-42",
        to: "AVL-65",
        edge: "RULED_ON",
        rationale: "KHO:2019:42 applied AVL § 65 to a concrete case.",
      },
    ],
    fullPath: [],
    subgraph: {
      nodeIds: FREELANCER_BFS_NODES,
      edgeIds: FREELANCER_BFS_EDGES,
    },
    flatChunks: FLAT_CHUNKS_BY_INTENT["freelancer-b2b-vat"],
    metrics: {
      graphTokens: 0, // filled in below by computeFallbackMetrics
      flatTokens: 0,
      graphNodeCount: FREELANCER_BFS_NODES.length,
      graphEdgeCount: FREELANCER_BFS_EDGES.length,
      seeds: ["OHJE-PALV-ULK", "AVL-65", "KHO-2019-42"],
      embeddingMethod: "local",
      answerProvider: "fallback",
    },
    source: "fallback",
  },

  "vehicle-input-vat": {
    query: QUERIES["vehicle-input-vat"].question,
    intent: "vehicle-input-vat",
    answer:
      "Input VAT on a passenger car (henkilöauto, M1 class) is generally NOT deductible under AVL § 114 a. The only narrow exceptions are vehicles used EXCLUSIVELY for taxable business activity — taxi service, driving school, vehicle rental, or resale fleet. Even minimal private use disqualifies the deduction entirely. Driving between home and a fixed workplace is treated as private use under Vero guidance and KHO case law, so a company car commuted home gets no deduction. Vans (pakettiauto, N1 class) are treated more liberally: input VAT is deductible pro rata against the business share of use, supported by a driving log (ajopäiväkirja). Required documentation: driving log distinguishing business kilometres, vehicle registration showing the class, and a clear business-purpose justification.",
    citations: [
      {
        node_id: "AVL-114a",
        label: "AVL § 114 a",
        snippet:
          "Henkilöauton hankinta-, vuokraus- ja käyttömenojen arvonlisävero on vähennyskelpoinen vain, jos henkilöauto on hankittu yksinomaan vähennykseen oikeuttavaan käyttöön…",
      },
      {
        node_id: "AVL-114",
        label: "AVL § 114",
        snippet:
          "Vähennystä ei saa tehdä, kun hankinta koskee henkilöauton hankintaa, vuokrausta tai käyttöä, lukuun ottamatta 114 a §:ssä säädettyjä tapauksia.",
      },
      {
        node_id: "OHJE-HENKAUTO-ALV",
        label: "Henkilöautojen ALV-vähennys",
        snippet:
          "Kodin ja vakituisen työpaikan välinen ajo katsotaan yksityiseksi käytöksi. Pakettiauton osalta vähennys voidaan jakaa käytön suhteessa…",
      },
      {
        node_id: "KHO-2017-31",
        label: "KHO:2017:31",
        snippet:
          "Pakettiauto, jolla suoritettiin pääosin tavarankuljetuksia, mutta jolla myös ajettiin kuljettajan asunnon ja työpaikan välillä…",
      },
    ],
    path: [
      {
        from: "AVL-114a",
        to: "AVL-114",
        edge: "EXCEPTION_TO",
        rationale:
          "AVL § 114 a carves a narrow business-use exception out of the general deduction restriction in AVL § 114.",
      },
      {
        from: "AVL-114",
        to: "AVL-102",
        edge: "EXCEPTION_TO",
        rationale:
          "AVL § 114 is the catalogue of restrictions on the general right to deduct in AVL § 102.",
      },
      {
        from: "AVL-114a",
        to: "DEF-HENKAUTO",
        edge: "USES_DEFINITION",
        rationale:
          "AVL § 114 a relies on the definition of Henkilöauto (M1 class).",
      },
      {
        from: "OHJE-HENKAUTO-ALV",
        to: "AVL-114a",
        edge: "INTERPRETS",
        rationale:
          "Vero guidance on passenger-car VAT explains how AVL § 114 a applies in mixed-use cases.",
      },
      {
        from: "KHO-2017-31",
        to: "AVL-114",
        edge: "RULED_ON",
        rationale:
          "KHO:2017:31 applied AVL § 114 to a pickup-truck commute scenario.",
      },
    ],
    fullPath: [],
    subgraph: {
      nodeIds: VEHICLE_BFS_NODES,
      edgeIds: VEHICLE_BFS_EDGES,
    },
    flatChunks: FLAT_CHUNKS_BY_INTENT["vehicle-input-vat"],
    metrics: {
      graphTokens: 0, // filled in below by computeFallbackMetrics
      flatTokens: 0,
      graphNodeCount: VEHICLE_BFS_NODES.length,
      graphEdgeCount: VEHICLE_BFS_EDGES.length,
      seeds: ["OHJE-HENKAUTO-ALV", "AVL-114a", "KHO-2017-31"],
      embeddingMethod: "local",
      answerProvider: "fallback",
    },
    source: "fallback",
  },

  "entertainment-deductibility": {
    query: QUERIES["entertainment-deductibility"].question,
    intent: "entertainment-deductibility",
    answer:
      "The treatment depends on classification. (1) Staff welfare (henkilökuntakulut) — events open to the whole staff and reasonable in scale — is fully deductible for corporate income tax under EVL § 8 and input VAT is deductible under AVL § 102. (2) Representation (edustusmenot) — client dinners and external entertainment — is deductible at 50 % for corporate income tax under EVL § 8 and input VAT is NOT deductible under AVL § 114. (3) Alcohol consumed in non-business private contexts is fully non-deductible. Classification turns on attendee composition (staff vs external), business purpose, and reasonableness per attendee. KHO:2018:91 confirms a staff Christmas party with alcohol can qualify as staff welfare when the event is open to the entire staff.",
    citations: [
      {
        node_id: "EVL-8",
        label: "EVL § 8",
        snippet:
          "Vähennyskelpoisia menoja ovat muun muassa henkilökunnan virkistyksestä… täysimääräisinä. Edustusmenoista vähennetään 50 prosenttia.",
      },
      {
        node_id: "AVL-114",
        label: "AVL § 114",
        snippet:
          "Vähennystä ei saa tehdä, kun hankinta koskee edustusmenoja tai verovelvollisen tai hänen henkilökuntansa yksityistä käyttöä.",
      },
      {
        node_id: "OHJE-EDUSTUS",
        label: "Edustus- ja henkilökuntamenot",
        snippet:
          "Edustusmenoista vähennetään tuloverotuksessa 50 % (EVL 8 §) ja ALV ei ole vähennyskelpoinen (AVL 114 §)…",
      },
      {
        node_id: "KHO-2018-91",
        label: "KHO:2018:91",
        snippet:
          "Yhtiö järjesti vuosittaisen pikkujoulun koko henkilökunnalle ravintolassa. KHO katsoi, että tilaisuus oli luonteeltaan henkilökunnan virkistystä…",
      },
    ],
    path: [
      {
        from: "EVL-8",
        to: "DEF-EDUSTUS",
        edge: "USES_DEFINITION",
        rationale:
          "EVL § 8 relies on the definition of Edustusmenot to apply the 50 % rule.",
      },
      {
        from: "AVL-114",
        to: "AVL-102",
        edge: "EXCEPTION_TO",
        rationale:
          "On the VAT side, AVL § 114 carves representation expenses out of the general deduction right in AVL § 102.",
      },
      {
        from: "OHJE-EDUSTUS",
        to: "EVL-8",
        edge: "INTERPRETS",
        rationale:
          "Vero guidance interprets EVL § 8 on the income-tax side of the classification.",
      },
      {
        from: "OHJE-EDUSTUS",
        to: "AVL-114",
        edge: "INTERPRETS",
        rationale:
          "The same Vero guidance interprets AVL § 114 on the VAT side — a single cross-domain explanation.",
      },
      {
        from: "KHO-2018-91",
        to: "EVL-8",
        edge: "RULED_ON",
        rationale:
          "KHO:2018:91 applied EVL § 8 to a staff Christmas party that included alcohol.",
      },
    ],
    fullPath: [],
    subgraph: {
      nodeIds: ENTERTAINMENT_BFS_NODES,
      edgeIds: ENTERTAINMENT_BFS_EDGES,
    },
    flatChunks: FLAT_CHUNKS_BY_INTENT["entertainment-deductibility"],
    metrics: {
      graphTokens: 0, // filled in below by computeFallbackMetrics
      flatTokens: 0,
      graphNodeCount: ENTERTAINMENT_BFS_NODES.length,
      graphEdgeCount: ENTERTAINMENT_BFS_EDGES.length,
      seeds: ["OHJE-EDUSTUS", "AVL-114", "KHO-2018-91"],
      embeddingMethod: "local",
      answerProvider: "fallback",
    },
    source: "fallback",
  },
};

// fullPath defaults to copying path — the dev toggle becomes a no-op in
// pure fallback mode but the UI still renders sanely.
//
// Token metrics are computed here, at module load, by running the same
// serialize-then-approxTokens heuristic the live route uses (see
// serializeFlatContext / serializeGraphContext in lib/retrieval.ts). This
// keeps fallback metrics defensible: whether the API is live or falling
// back to canned data, both budgets come from the same approximation
// applied to the prompt-like context each method would assemble.
for (const intent of Object.keys(FALLBACK_DATA_BY_INTENT)) {
  const data = FALLBACK_DATA_BY_INTENT[intent];
  data.fullPath = [...data.path];

  const nodeIdSet = new Set(data.subgraph.nodeIds);
  const edgeIdSet = new Set(data.subgraph.edgeIds);
  const nodes = FALLBACK_GRAPH.nodes.filter((n) => nodeIdSet.has(n.id));
  const edges = FALLBACK_GRAPH.edges.filter((e) => edgeIdSet.has(e.id));

  data.metrics.flatTokens = approxTokens(serializeFlatContext(data.flatChunks));
  data.metrics.graphTokens = approxTokens(
    serializeGraphContext(nodes, edges, data.path)
  );
}

export function pickFallback(query: string): AskResponse {
  const lc = query.toLowerCase();
  if (/(passenger car|henkilöauto|van|pakettiauto|vehicle|auto|company car|pickup|service van|driving log)/.test(lc)) {
    return FALLBACK_DATA_BY_INTENT["vehicle-input-vat"];
  }
  if (/(alcohol|alkoholi|staff party|pikkujoulu|client dinner|entertainment|edustus|representation|virkistys|welfare)/.test(lc)) {
    return FALLBACK_DATA_BY_INTENT["entertainment-deductibility"];
  }
  return FALLBACK_DATA_BY_INTENT["freelancer-b2b-vat"];
}
