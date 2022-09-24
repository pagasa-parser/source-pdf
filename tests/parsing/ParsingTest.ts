import * as fs from "fs";
import * as path from "path";
import PagasaParserPDFSource from "../../src/PagasaParserPDFSource";

describe("parsing tests", () => {

    jest.setTimeout(20000);

    const faultyPDFs = fs.readdirSync(path.join(__dirname, "..", "pdf", "faulty"));
    const workingPDFs = fs.readdirSync(path.join(__dirname, "..", "pdf", "working"));

    for (const pdf of [...faultyPDFs, ...workingPDFs]) {
        if ( process.env.PP_FILTER && !new RegExp(process.env.PP_FILTER, "i").test(pdf) ) {
            continue;
        }

        const faulty = faultyPDFs.includes(pdf);
        test(`${faulty ? "Faulty" : "Working"} PDF: ${pdf}`, async () => {
            const source = await new PagasaParserPDFSource(
                path.join(__dirname, "..", "pdf", faulty ? "faulty" : "working", pdf)
            );

            const outDir = path.join(__dirname, "..", "out", pdf.replace(/.pdf$/g, ""));
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }

            fs.writeFileSync(path.join(outDir, "stream.json"),
                JSON.stringify(await source.getTabulaStreamData()));
            fs.writeFileSync(path.join(outDir, "lattice.json"),
                JSON.stringify(await source.getTabulaLatticeData()));

            if (faulty) {
                await expect(async () => {
                    fs.writeFileSync(path.join(outDir, "data.json"),
                        JSON.stringify(await source.parse()));
                }).rejects.toThrow();
            } else {
                fs.writeFileSync(path.join(outDir, "data.json"),
                    JSON.stringify(await source.parse()));
            }
        });
    }

});
