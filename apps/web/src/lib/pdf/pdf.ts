//@ts-nocheck
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

interface TextItem {
    str: string;
    transform: number[];
}

export async function extractPdfText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
        data: buffer,
    }).promise;

    let output = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);

        const textContent = await page.getTextContent();

        const items = textContent.items
            .filter(
                (item): item is TextItem =>
                    "str" in item && "transform" in item
            )
            .map((item) => ({
                text: item.str.trim(),
                x: item.transform[4],
                y: item.transform[5],
            }))
            .filter((item) => item.text.length > 0);

        // Group by Y position (same row)
        const rows = new Map<number, typeof items>();

        for (const item of items) {
            const y = Math.round(item.y);

            const existingKey = [...rows.keys()].find(
                (k) => Math.abs(k - y) <= 2
            );

            const key = existingKey ?? y;

            if (!rows.has(key)) {
                rows.set(key, []);
            }

            rows.get(key)!.push(item);
        }

        // Sort rows from top → bottom
        const sortedRows = [...rows.entries()].sort(
            (a, b) => b[0] - a[0]
        );

        for (const [, row] of sortedRows) {
            // Sort columns left → right
            row.sort((a, b) => a.x - b.x);

            output += row.map((i) => i.text).join(" ") + "\n";
        }

        output += "\n";
    }

    return output;
}