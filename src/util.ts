export function randomIndex(array: readonly unknown[]): number {
    return Math.floor(Math.random() * array.length);
}

export function randomEntry<T>(array: readonly T[]): T {
    // data.json arrays are never empty, so the index is always in range
    return array[randomIndex(array)]!;
}
