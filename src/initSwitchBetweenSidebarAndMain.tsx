import { Button, Toaster } from "@blueprintjs/core";
import ReactDOM from "react-dom";
import { SidebarWindow, SidebarWindowInput } from "roamjs-components/types";
import { extension_helper } from "./helper";

const rightSidebar = window.roamAlphaAPI.ui.rightSidebar
type SideWindowInfo = SidebarWindow & {
    dom: HTMLElement;
}

let unMountsArr: (() => void)[] = [];
const unMounts = {
    add(fn: () => void) {
        unMountsArr.push(fn)
    },
    clean() {
        unMountsArr.forEach(fn => fn());
        document.querySelectorAll(".sidebar-switch").forEach(el => {
            el.remove()
        })

        unMountsArr = [];
    },
    init() {
        unMountsArr = [];
    }
}

export function initSwitchBetweenSidebarAndMain(extensionAPI: RoamExtensionAPI) {
    const id = "sidebar-switch";
    createSwitchLastCommand(extensionAPI);
    extensionAPI.settings.panel.create({
        tabTitle: 'Switch+',
        settings: [
            {
                id,
                name: "Switch between sidebar view and main view",
                description: `eeee`,
                action: {
                    type: "switch",
                    onChange: (evt: any) => {
                        console.log('evt: ', evt.target.value, evt.target.check, evt, unMountsArr)
                        if (evt.target.checked) {
                            init()
                        } else {
                            unMounts.clean();
                        }
                    }
                }
            },

        ]
    });

    if (extensionAPI.settings.get(id) == null) {
        extensionAPI.settings.set(id, true)
    }
    setTimeout(() => {
        console.log(extensionAPI.settings.get(id), ' ----')
        if (extensionAPI.settings.get(id)) {
            init()
        }
    })
}

function init() {

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
        })
    }

    const main = () => {
        if (!isSidebarOpen()) {
            return
        }
        unMounts.init()
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
    unMounts.add(() => observer.disconnect())
    extension_helper.on_uninstall(() => unMounts.clean())
    main();
}

function SwitchButton(props: { onClick: () => void }) {
    return <Button icon="swap-horizontal" minimal small onClick={props.onClick} />
}

const getBlockId = (w: any) => {
    return w["block-uid"] || w['page-uid']
}


let lastSwitchSidebar: SidebarWindowInput & { order: number }

function createSwitchLastCommand(extensionAPI: RoamExtensionAPI) {
    extensionAPI.ui.commandPalette.addCommand({
        label: "Switch main view back to sidebar",
        callback: () => {
            if (!lastSwitchSidebar) {
                Toaster.create({}).show({ message: 'No switching history', intent: 'warning' })
                return
            }
            doSwitch(lastSwitchSidebar)
        }
    })
}

export async function doSwitch(w: Pick<SideWindowInfo, "type" | "order">) {
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
    if (uid) {

        const newWindow = {
            type: 'outline' as const,
            "block-uid": uid,
            order: w.order
        }

        lastSwitchSidebar = newWindow

        rightSidebar.addWindow({
            window: newWindow
        })
    }

}
