import * as fs from "fs";
import * as path from "path";
import PagasaParserPDFSource from "../../src/PagasaParserPDFSource";

describe("parsing tests", () => {

    jest.setTimeout(20000);
    test("original bulletin", async () => {
        const source = new PagasaParserPDFSource(
            path.join(__dirname, "..", "pdf", "2021_Kiko_14.pdf")
        );

        fs.writeFileSync(
            path.join(__dirname, "..", "out", "Kiko.json"),
            JSON.stringify(await source.parse())
        );
    });

});
