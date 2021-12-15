import type {TabulaCell, TabulaJSONOutput, TabulaPage} from "./Tabula";

type ExpandedCell = TabulaCell & {
    cellId: number,
    row: TabulaCell[],
    rowId: number,
    page: TabulaPage,
    pageId: number,
    next: () => ExpandedCell,
    previous: () => ExpandedCell
};

export function search(array: TabulaJSONOutput, condition: RegExp, ignores?: string[])
    : ExpandedCell & { match: RegExpExecArray };
export function search(array: TabulaJSONOutput, condition: (item: string) => boolean, ignores?: string[])
    : ExpandedCell;
export function search(
    array: TabulaJSONOutput,
    condition: RegExp | ((item: string) => boolean),
    ignores?: string[]
) : ExpandedCell {
    for (const pageId in array) {
        const page = array[pageId];
        for (const rowId in page.data) {
            const row = page.data[rowId];

            const upgrade = (cellId : number, row: TabulaCell[], page: TabulaPage) => {
                return Object.assign(row[cellId], {
                    cellId,
                    row,
                    rowId: +rowId,
                    page,
                    pageId: +pageId,
                    next: () => {
                        if (row[cellId + 1] != null)
                            return upgrade(cellId + 1, row, page);
                        else if (page.data[+rowId + 1]?.[0] != null)
                            return upgrade(0, page.data[+rowId + 1], page);
                        else if (array[+pageId + 1]?.data[0]?.[0] != null)
                            return upgrade(0, array[+pageId + 1].data[0], array[+pageId + 1]);
                        return null;
                    },
                    previous: () => {
                        if (row[cellId - 1] != null)
                            return upgrade(cellId - 1, row, page);
                        else if (page.data[+rowId - 1]?.[0] != null)
                            return upgrade(0, page.data[+rowId + 1], page);
                        else if (array[+pageId - 1]?.data[0]?.[0] != null)
                            return upgrade(0, array[+pageId - 1].data[0], array[+pageId - 1]);
                        return null;
                    }
                })
            };

            for (const cellId in row) {
                if ((ignores ?? []).includes(`${pageId}:${rowId}:${cellId}`)) continue;

                const cell = row[cellId];
                if (typeof condition === "function") {
                    if (condition(cell.text))
                        return upgrade(+cellId, row, page);
                } else {
                    let execResult;
                    if ((execResult = new RegExp(condition.source, condition.flags).exec(cell.text)) != null)
                        return Object.assign(upgrade(+cellId, row, page), { match: execResult });
                }
            }
        }
    }
    return null;
}

export function searchAll(array: TabulaJSONOutput, condition: RegExp) : (ExpandedCell & { match: RegExpExecArray })[];
export function searchAll(array: TabulaJSONOutput, condition: (item: string) => boolean) : ExpandedCell[];
export function searchAll(array: TabulaJSONOutput, condition: RegExp | ((item: string) => boolean)) {
    let lastSearch;
    const ignores : string[] = [];
    const results = [];

    do {
        // any-casted since TypeScript is weird and overload implementations can't be exposed.
        lastSearch = search(array, condition as any, ignores);
        if (lastSearch != null) {
            ignores.push(`${lastSearch.pageId}:${lastSearch.rowId}:${lastSearch.cellId}`);
            results.push(lastSearch);
        }
    } while (lastSearch != null);

    return results;
}
