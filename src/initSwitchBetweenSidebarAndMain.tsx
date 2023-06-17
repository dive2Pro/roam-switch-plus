import { Button } from "@blueprintjs/core";
import ReactDOM from "react-dom";
import { SidebarWindow, SidebarWindowInput } from "roamjs-components/types";
import { extension_helper } from "./helper";

const rightSidebar = window.roamAlphaAPI.ui.rightSidebar
type SideWindowInfo = SidebarWindow & {
    dom: HTMLElement;
}
export function initSwitchBetweenSidebarAndMain() {

    const isSidebarOpen = () => !!document.querySelector("#roam-right-sidebar-content");

    const getSideWindows = () => {
        const windows = rightSidebar.getWindows().sort((a, b) => a.order - b.order) as SideWindowInfo[]

        document.querySelectorAll(".rm-sidebar-window")
            .forEach((w, i) => {
                windows[i].dom = w as HTMLElement;
            })

        return windows

    }

    const addSwitchIcons = (windows: SideWindowInfo[]) => {
        const switchIconClass = `sidebar-switch`
        windows.forEach(w => {
            const controls = w.dom.querySelector('.rm-sidebar-window__controls')
            if (!controls) {
                return;
            }
            let el = controls.querySelector(`.${switchIconClass}`)
            if (!el) {
                el = document.createElement("div")
                el.className = switchIconClass;
                controls.appendChild(el);
            }
            ReactDOM.render(<SwitchButton onClick={() => {
                doSwitch(w)
            }} />, el)
            extension_helper.on_uninstall(() => {
                controls.removeChild(el)
            })
        })
    }

    const main = () => {
        if (!isSidebarOpen()) {
            return
        }
        addSwitchIcons(getSideWindows())
    }

    const div = document.getElementById('right-sidebar');

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                console.log('Child list changed');
                console.log(mutation.addedNodes); // list of added nodes
                console.log(mutation.removedNodes); // list of removed nodes
                mutation.addedNodes.forEach((node) => {
                    if ((node as Element).querySelector('.rm-sidebar-window')) {
                        main()
                    } else if ((node as Element).className === ('rm-sidebar-outline-wrapper')) {
                        main()
                    }
                })
            }
        });
    });

    observer.observe(div, { childList: true, subtree: true });
    extension_helper.on_uninstall(() => observer.disconnect())
    main();
}

function SwitchButton(props: { onClick: () => void }) {
    return <Button icon="swap-horizontal" minimal small onClick={props.onClick} />
}

const getBlockId = (w: any) => {
    return w["block-uid"] || w['page-uid']
}

async function doSwitch(w: SideWindowInfo) {
    const uid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid()
    console.log(w, ' ==== www', uid)
    rightSidebar.removeWindow({
        window: {
            "block-uid": getBlockId(w),
            type: w.type
        }
    })

    window.roamAlphaAPI.ui.mainWindow.openBlock({
        block: {
            uid: getBlockId(w)
        }
    })
    if (uid)
        rightSidebar.addWindow({
            window: {
                type: 'outline',
                "block-uid": uid,
                // @ts-ignore
                order: w.order
            }
        })
}
