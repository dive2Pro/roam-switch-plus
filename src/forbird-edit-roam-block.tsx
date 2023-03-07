import { useEffect, useRef } from "react";

export function ForbidEditRoamBlock(props: { uid: string }) {
    useEffect(() => {
        window.roamAlphaAPI.ui.components.renderBlock({
            uid: props.uid,
            el: ref.current,
            // @ts-ignore
            "zoom-path?": true
        })
    }, [props.uid])
    const ref = useRef()
    return <div style={{ pointerEvents: 'none' }}>
        <div ref={ref} />
    </div>
}