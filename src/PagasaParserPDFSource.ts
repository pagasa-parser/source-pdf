import {AreaExtractor, Bulletin, BulletinInfo, Cyclone, Landmass, PagasaParserSource, TCWSLevels} from "pagasa-parser";
import * as childProcess from "child_process";
import * as path from "path";
import * as url from "url";
import {search, searchAll} from "./Utilities";
import type {TabulaJSONOutput} from "./Tabula";

export default class PagasaParserPDFSource extends PagasaParserSource {

    /**
     * Loads in the PDF from the given path.
     *
     * @param path The string to a PDF.
     */
    constructor(private path: string) {
        super();
        try {
            childProcess.execSync("java --version");
        } catch (e) {
            throw new Error("Cannot find Java in PATH. Java is required for this package to function.");
        }
    }

    tabulaStreamData: TabulaJSONOutput;
    tabulaLatticeData: TabulaJSONOutput;

    async getTabulaStreamData(): Promise<TabulaJSONOutput> {
        if (this.tabulaStreamData != null)
            return this.tabulaStreamData;

        const tabulaStream = childProcess.spawn("java", [
            "-Dfile.encoding=UTF8", "-jar", path.resolve(__dirname, "..", "bin", "tabula.jar"),
            "-p", "all", "-t", "-f", "JSON", this.path
        ]);
        const tabulaStreamChunks: Buffer[] = [];
        tabulaStream.stdout.on("data", (data) => {
            tabulaStreamChunks.push(Buffer.from(data));
        });
        tabulaStream.stderr.on("data", (data) => {
            console.log(`err: ${data}`);
        });
        return new Promise<void>((res) => { tabulaStream.on("close", res); })
            .then(() => this.tabulaStreamData =
                JSON.parse(Buffer.concat(tabulaStreamChunks).toString("utf8")));
    }

    async getTabulaLatticeData(): Promise<TabulaJSONOutput> {
        if (this.tabulaLatticeData != null)
            return this.tabulaLatticeData;

        const tabulaData = childProcess.spawn("java", [
            "-Dfile.encoding=UTF8", "-jar", path.resolve(__dirname, "..", "bin", "tabula.jar"),
            "-p", "all", "-l", "-f", "JSON", this.path
        ]);
        const tabulaLatticeChunks: Buffer[] = [];
        tabulaData.stdout.on("data", (data) => {
            tabulaLatticeChunks.push(Buffer.from(data));
        });
        tabulaData.stderr.on("data", (data) => {
            console.log(`err: ${data}`);
        });
        return new Promise<void>((res) => { tabulaData.on("close", res); })
            .then(() => this.tabulaLatticeData =
                JSON.parse(Buffer.concat(tabulaLatticeChunks).toString("utf8")));
    }

    async getTabulaData(): Promise<[TabulaJSONOutput, TabulaJSONOutput]> {
        return Promise.all([
            this.getTabulaStreamData(),
            this.getTabulaLatticeData()
        ]);
    }

    async parse(): Promise<Bulletin> {
        const [tabulaStreamChunks, tabulaLatticeChunks] = await this.getTabulaData();

        return this.extract(tabulaStreamChunks, tabulaLatticeChunks);
    }

    extract(stream: TabulaJSONOutput, lattice: TabulaJSONOutput): Bulletin {
        const info = this.extractInfo(stream, lattice);
        const cyclone = this.extractCyclone(stream, lattice);
        const signals = this.extractSignals(stream, lattice);

        const now = new Date();
        const active = info.issued < now && now < info.expires;

        return { active, info, cyclone, signals };
    }

    extractInfo(stream: TabulaJSONOutput, lattice: TabulaJSONOutput): BulletinInfo {
        let final = false;
        const countCell = search(stream, /Tropical Cyclone Bulletin N[ro]\. (\d+)/gi);

        if (countCell.text?.endsWith("F"))
            final = true;

        let titleCell = countCell.next();

        while (titleCell.text.trim().length == 0)
            titleCell = titleCell.next();

        const issued = new Date(search(stream, /Issued(?:\sat)?\s(.+)$/gi).match[1] + " GMT+8");

        const timeSearch = search(stream, /next bulletin at (\d+):(\d+)\s(AM|PM)\s(.+?)(?:\.|$)/gi);
        let expireDate = new Date(issued.getTime());
        if (timeSearch == null) {
            expireDate = null;
            final = true;
        } else {
            const timeMatch = timeSearch.match;

            let dateWrapping = timeMatch[4] !== "today";
            const expiryHourPH = +timeMatch[1] + (timeMatch[3].toLowerCase() === "pm" ? 12 : 0);
            if (expiryHourPH - 8 < expireDate.getUTCHours()) {
                dateWrapping = true;
            }
            expireDate.setUTCHours(expiryHourPH - 8);
            expireDate.setUTCMinutes(+timeMatch[2]);

            if (dateWrapping)
                expireDate.setDate(expireDate.getDate() + 1);
        }

        return {
            title: `${countCell.text} for ${titleCell.text.replace(/“”/g, "")}`,
            count: +countCell.match[1],
            url: url.pathToFileURL(this.path).toString(),
            final: final,
            issued: issued,
            expires: expireDate,
            summary: lattice.filter(l => l.data.length > 0)[0].data[0][0].text
        };
    }

    extractCyclone(stream: TabulaJSONOutput, lattice: TabulaJSONOutput): Cyclone {
        const headerCell = search(stream, /Tropical Cyclone Bulletin N[ro]\. (\d+)/gi);
        let titleCell = headerCell.next();

        while (titleCell.text.trim().length == 0)
            titleCell = titleCell.next();

        const title = titleCell.text.trim();
        const [, category, name, internationalName] = /^(?:(.*)\s|^)[“"]?([^()]+?)["”]?(?:\s\((.+?)\))?$/g.exec(title);

        const positionMatch = search(lattice, /([0-9.]+)°([NS]),\s?([0-9.]+)°([WE])/gi).match;
        const position = {
            lat: +positionMatch[1] * (positionMatch[2] === "S" ? -1 : 1),
            lon: +positionMatch[3] * (positionMatch[4] === "W" ? -1 : 1),
        };

        const movementMatch = search(lattice, /present\s?movement(?:.*([\r\n]*.+))?/gi);
        let movementString: string;
        if (movementMatch) {
            if (movementMatch.match[1] != null && movementMatch.match[1].trim().length !== 0) {
                // Movement string is in same cell. Parse out.
                movementString = movementMatch.match[1].trim();
            } else {
                movementString = movementMatch.page.data[movementMatch.rowId + 1][0].text;
            }
        }

        return {
            name: name,
            internationalName: internationalName,
            category: category,
            prevailing: true,
            center: position,
            movement: movementString
        };
    }

    extractSignals(stream: TabulaJSONOutput, lattice: TabulaJSONOutput): TCWSLevels {
        const signals: TCWSLevels = { 1: null, 2: null, 3: null, 4: null, 5: null };

        const signalHeaders = searchAll(lattice, /^(\d)(?:.|[\r\n])+(?:winds?|hours\))/gi);
        for (const signalCell of signalHeaders) {
            const signal = +signalCell.match[1] as 1 | 2 | 3 | 4 | 5;

            /* +-------------+-------+---------+----------+
             * | signal cell | Luzon | Visayas | Mindanao |
             * +-------------+-------+---------+----------+
             *   signalCell    .next   .next     .next
             */

            const luzon = new AreaExtractor(signalCell.next().text).extractAreas();
            const visayas = new AreaExtractor(signalCell.next().next().text).extractAreas();
            const mindanao = new AreaExtractor(signalCell.next().next().next().text).extractAreas();

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
