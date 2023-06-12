
type Block = {
    ":block/string"?: string,
    ":node/title"?: string,
    ":block/_children": Block[],
    ":block/uid": string
}

export const getParentsStrFromBlockUid = (uid: string) => {
    const result = window.roamAlphaAPI.pull(
        `
        [
            :block/uid
            :block/string
            :node/title
            {:block/_children ...}
        ]
    `,
        [":block/uid", `${uid}`]
    ) as unknown as Block;
     console.log(uid, result, ' paths ')
    if (result) {
        let strs: { text: string, uid: string }[] = [{
            text: result[":block/string"] || result[":node/title"],
            uid: result[":block/uid"]
        }];
        let ary = result[":block/_children"];
        while (ary && ary.length) {
            const block = ary[0];
            strs.unshift({
                text: block[":block/string"] || block[":node/title"],
                uid: block[":block/uid"]
            });
            ary = block[":block/_children"];
        }
        return strs;
    }
    return [{
        uid,
        text: window.roamAlphaAPI.q(`
            [
                :find ?b .
                :where
                    [?p :block/uid "${uid}"]
                    [?p :node/title ?b]
                
            ]
        `) as unknown as string
    }];
};