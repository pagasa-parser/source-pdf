import {
    AreaExtractor,
    Bulletin, BulletinInfo, Cyclone,
    PagasaParserSource, TCWSLevels, Landmass
} from "pagasa-parser";
import * as child_process from "child_process";
import * as path from "path";
import * as url from "url";
import {search, searchAll} from "./Utilities";

export default class PagasaParserPDFSource extends PagasaParserSource {

    /**
     * Loads in the PDF from the given path.
     *
     * @param path The string to a PDF.
     */
    constructor(private path : string) {
        super();
        try {
            const java_version = child_process.execSync("java --version");
        } catch (e) {
            throw new Error("Cannot find Java in PATH. Java is required for this package to function.");
        }
    }

    async parse(): Promise<Bulletin> {
        const tabula_stream = child_process.spawn("java", [
            "-Dfile.encoding=UTF8", "-jar", path.resolve(__dirname, "..", "bin", "tabula.jar"),
            "-p", "all", "-t", "-f", "JSON", this.path
        ]);
        const tabula_lattice = child_process.spawn("java", [
            "-Dfile.encoding=UTF8", "-jar", path.resolve(__dirname, "..", "bin", "tabula.jar"),
            "-p", "all", "-l", "-f", "JSON", this.path
        ]);

        let tabulaStreamChunks : Buffer[] = [];
        tabula_stream.stdout.on("data", (data) => {
            tabulaStreamChunks.push(Buffer.from(data));
        });
        let tabulaLatticeChunks : Buffer[] = [];
        tabula_lattice.stdout.on("data", (data) => {
            tabulaLatticeChunks.push(Buffer.from(data));
        });

        tabula_stream.stderr.on("data", (data) => {
            console.log(`err: ${data}`)
        });
        tabula_lattice.stderr.on("data", (data) => {
            console.log(`err: ${data}`)
        });

        await Promise.all([
            new Promise<void>((res) => { tabula_stream.on("close", res) }),
            new Promise<void>((res) => { tabula_lattice.on("close", res) })
        ]);

        return this.extract(
            JSON.parse(Buffer.concat(tabulaStreamChunks).toString("utf8")),
            JSON.parse(Buffer.concat(tabulaLatticeChunks).toString("utf8"))
        );
    }

    extract(stream : TabulaJSONOutput, lattice: TabulaJSONOutput) : Bulletin {
        const info = this.extractInfo(stream, lattice);
        const cyclone = this.extractCyclone(stream, lattice);
        const signals = this.extractSignals(stream, lattice);

        const now = new Date();
        const active = info.issued < now && now < info.expires;

        return { active, info, cyclone, signals };
    }

    extractInfo(stream: TabulaJSONOutput, lattice: TabulaJSONOutput) : BulletinInfo {
        const countCell = search(stream, /Tropical Cyclone Bulletin No. (\d+)/gi);
        const titleCell = countCell.next();
        const issued = new Date(search(stream, /Issued(?:\sat)?\s(.+)$/gi).match[1] + " GMT+8");

        const timeMatch = search(stream, /next bulletin at (\d+):(\d+)\s(AM|PM)\s(.+?)(?:\.|$)/gi).match;

        const expireDate = new Date(issued.getTime());
        if (timeMatch[4] !== "today")
            expireDate.setDate(expireDate.getDate() + 1);
        expireDate.setUTCHours(
            +timeMatch[1] + (timeMatch[3].toLowerCase() === "pm" ? 12 : 0) - 8,
            +timeMatch[2],
            0,
            0
        );

        return {
            title: `${countCell.text} for ${titleCell.text.replace(/“”/g, "")}`,
            count: +countCell.match[1],
            url: url.pathToFileURL(this.path).toString(),
            issued: issued,
            expires: expireDate,
            summary: lattice.filter(l => l.data.length > 0)[0].data[0][0].text
        }
    }

    extractCyclone(stream: TabulaJSONOutput, lattice: TabulaJSONOutput) : Cyclone {
        const title = search(stream, /Tropical Cyclone Bulletin No. (\d+)/gi).next().text;
        const [, name, internationalName] = /[“"](.+?)["”](?:\s\((.+?)\))?/g.exec(title);

        const positionMatch = search(lattice, /([0-9.]+)°([NS]),\s?([0-9.]+)°([WE])/gi).match;
        const position = {
            lat: +positionMatch[1] * (positionMatch[2] === "S" ? -1 : 1),
            lon: +positionMatch[3] * (positionMatch[4] === "W" ? -1 : 1),
        };

        const movementMatch = search(lattice, /present\s?movement/gi);
        const movementString : string = movementMatch.page.data[movementMatch.rowId + 1][0].text;

        return {
            name: name,
            internationalName: internationalName,
            prevailing: true,
            center: position,
            movement: movementString
        };
    }

    extractSignals(stream: TabulaJSONOutput, lattice: TabulaJSONOutput) : TCWSLevels {
        const signals : TCWSLevels = { 1: null, 2: null, 3: null, 4: null, 5: null };

        const signalHeaders = searchAll(lattice, /^(\d)(?:.|[\r\n])+hours\)/gi);
        for (const signalCell of signalHeaders) {
            const signal = +signalCell.match[1] as 1 | 2 | 3 | 4 | 5;

            const luzon = new AreaExtractor(signalCell.next().text).extractAreas();
            const visayas = new AreaExtractor(signalCell.next().next().text).extractAreas();
            const mindanao = new AreaExtractor(signalCell.next().next().text).extractAreas();

            signals[signal] = {
                areas: {
                    [Landmass.Luzon]: luzon,
                    [Landmass.Visayas]: visayas,
                    [Landmass.Mindanao]: mindanao
                }
            };
        }

        return signals;
    }

}
