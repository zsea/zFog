

export class Random {
    /**
     * 产生一个[0,1)之间的随机数
     * @returns 
     */
    static random(): number {
        return Math.random();
    }
    /**
     * 产生一个[min,max)之间的随机数
     * @param min 
     * @param max 
     * @returns 
     */
    static range(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }
    /**
     * 产生一个[min,max)或[min,max]之间的随机整数
     * @param min 
     * @param max 
     * @param type - 若为open，则产生的随机整数范围为[min,max)，若为closed，则产生的随机数范围为[min,max]
     * @returns 
     */
    static rangeInt(min: number, max: number, type: "open" | "closed"="open"): number {
        min = Math.ceil(min);
        max = Math.floor(max);
        let step: number = type === "closed" ? 1 : 0;
        return Math.floor(Math.random() * (max - min + step)) + min;
    }
}