export interface TabulaElement {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface TabulaCell extends TabulaElement {
    text: string;
}

export type TabulaData = TabulaCell[][];

export interface TabulaPage extends TabulaElement {
    extraction_method: "lattice" | "stream";
    bottom: number;
    right: number;
    data: TabulaData;
}

export type TabulaJSONOutput = TabulaPage[];
