interface TabulaElement {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface TabulaCell extends TabulaElement {
    text: string;
}

type TabulaData = TabulaCell[][];

interface TabulaPage extends TabulaElement {
    extraction_method: "lattice" | "stream";
    bottom: number;
    right: number;
    data: TabulaData;
}

type TabulaJSONOutput = TabulaPage[];
