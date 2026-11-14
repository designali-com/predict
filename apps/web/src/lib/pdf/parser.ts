import { biomarkers } from "./biomarkers";

export interface ParsedBiomarker {
    value: number | null;
    unit: string | null;
    matchedAlias: string | null;
}

export type ParsedReport = Record<string, ParsedBiomarker>;

const RESULT_REGEX =
    /([0-9]+(?:\.[0-9]+)?)\s*(mg\s*\/\s*dL|mg\s*\/\s*L|ng\s*\/\s*mL|pg\s*\/\s*mL|%)/gi;

function normalize(text: string) {
    return text
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeUnit(unit?: string | null) {
    if (!unit) return null;

    return unit
        .replace(/\s+/g, "")
        .replace(/mg\/dl/i, "mg/dL")
        .replace(/mg\/l/i, "mg/L")
        .replace(/ng\/ml/i, "ng/mL")
        .replace(/pg\/ml/i, "pg/mL");
}

function extractResult(text: string) {
    const matches = [...text.matchAll(RESULT_REGEX)]
  
    const match = matches[0]
  
    if (!match) return null
  
    return {
      value: Number(match[1]),
      unit: normalizeUnit(match[2]),
    }
  }

function escapeRegex(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseReport(text: string): ParsedReport {
    const report: ParsedReport = {};

    for (const key of Object.keys(biomarkers)) {
        report[key] = {
            value: null,
            unit: null,
            matchedAlias: null,
        };
    }

    const lines = text
        .split(/\r?\n/)
        .map(normalize)
        .filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
        // Look ahead a few lines because many reports wrap test names/results
        const window = lines.slice(i, i + 3).join(" ");

        for (const [key, aliases] of Object.entries(biomarkers)) {
            //@ts-ignore
            if (report[key].value !== null) continue;

            for (const alias of aliases) {
                // if (key === "pth") {
                //     console.log("ALIAS:", alias);
                //     console.log("WINDOW:", window);
                // }
                const aliasRegex = new RegExp(
                    `(^|\\b)${escapeRegex(alias)}(\\b|$)`,
                    "i"
                );

                const match = aliasRegex.exec(window);

                // if (key === "pth") {
                //     console.log("MATCH?", !!match);
                // }

                if (!match) continue;

                // console.log("MATCHED:", alias);

                const searchText = window.slice(match.index + match[0].length);

                const parsed = extractResult(searchText);

                if (!parsed) continue;

                report[key] = {
                    value: parsed.value,
                    unit: parsed.unit,
                    matchedAlias: alias,
                };

                break;
            }
        }
    }

    return report;
}