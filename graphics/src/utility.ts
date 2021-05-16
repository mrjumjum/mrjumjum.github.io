export function randomInt(min: number, max: number): number{
    return Math.floor(Math.random() * (max - min) ) + min;
}

export function randomFloat(min: number, max: number): number{
    return Math.random() * (max - min) + min;
}

export function randomFloatUnderOne(): number{
    return Math.random();
}
