import React, { FC, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Button,
  ButtonGroup,
  IconName,
  Menu,
  MenuItem,
  Tag,
  Toaster,
  Tooltip,
  Icon,
  Popover,
  Position,
} from "@blueprintjs/core";
import { IItemRendererProps, ItemRenderer, Omnibar } from "@blueprintjs/select";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import "./style.less";
import { TreeNode } from "roamjs-components/types";
import { useEvent } from "./hooks";
import { extension_helper, formatDate, simulateClick } from "./helper";
import { getParentsStrFromBlockUid } from "./roam";
import {
  doSwitch,
  initSwitchBetweenSidebarAndMain,
} from "./initSwitchBetweenSidebarAndMain";
import { highlightText, SwitchResultItem } from "./components/SwitchResultItem";

const delay = (ms?: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
type TreeNode2 = Omit<TreeNode, "children"> & {
  parents: { id: string }[];
  children: TreeNode2[];
  deep: string;
  refs?: { string?: string; uid: string; title?: string }[];
  time: number;
};
export type TreeNode3 = Omit<TreeNode2, "refs" | "chilren"> & {
  tags: { type: "page" | "block"; text: string }[];
  string?: string;
};

export type SideBarItem = {
  "collapsed?": boolean;
  order: number;
  "pinned?": boolean;
  "window-id": string;
  dom: Element;
  title: string;
  uid: string;
  icon?: IconName;
} & (
  | { type: "custom"; onClick: () => void }
  | { type: "search-query" }
  | { type: "graph"; "page-uid": string }
  | { type: "block"; "block-uid": string }
  | { type: "outline"; "page-uid": string }
  | { type: "mentions"; "mentions-uid": string }
);

type ITEM = SideBarItem | TreeNode3;

const isSidebarItem = (item: ITEM): item is SideBarItem => {
  return "dom" in item;
};
let oldHref = "";
const api = {
  getAllChangesWithin2Day() {
    const now = new Date(); // 获取当前时间
    const oneDayAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 获取 24 小时前的时间
    const timestamp = Math.floor(oneDayAgo.getTime());

    console.time("within day");
    const r = (
      window.roamAlphaAPI.data.q(
        `
    [
            :find [(pull ?e [:edit/time :block/uid :block/string]) ...]
            :in $ ?start_of_day
            :where                
                [?e :edit/time ?time]
                [(> ?time ?start_of_day)] 
        ]
    `,
        timestamp
      ) as unknown as TreeNode3[]
    )
      // ** filter is much slower  than query by start_of_day
      // .filter(a => {
      //   return a.time > timestamp
      // })
      .sort((a, b) => {
        return b.time - a.time;
      })
      .filter((item) => item.string);
    console.timeEnd("within day");

    return r;
  },
  focusOnBlock(item: TreeNode3) {
    window.roamAlphaAPI.ui.setBlockFocusAndSelection({
      location: {
        "block-uid": item.uid,
        "window-id": "main-window",
      },
    });
  },
  async checkIsUnderCurrentBlock(item: TreeNode3) {
    const openUid =
      await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
    const openId = window.roamAlphaAPI.q(
      `[:find ?e . :where [?e :block/uid "${openUid}"]]`
    ) as unknown as string;
    // console.log(item.parents.some(p => p.id === openId), ' is Under ', item, openUid)
    return item.parents.some((p) => p.id === openId);
  },
  async openRightsidebar() {
    await window.roamAlphaAPI.ui.rightSidebar.open();
    await delay(10);
  },
  toggleSidebarWindow(sidebarItem: SideBarItem) {
    simulateClick(sidebarItem.dom.querySelector(".rm-caret"));
  },
  removeSidebarWindow(sidebarItem: SideBarItem) {
    simulateClick(sidebarItem.dom.querySelector(".bp3-icon-cross"));
  },
  getRightSidebarItems() {
    const parentEl = document.querySelector(".sidebar-content");
    if (!parentEl) {
      return [];
    }
    return window.roamAlphaAPI.ui.rightSidebar
      .getWindows()
      .sort((a, b) => a.order - b.order)
      .map((sidebarItemWindow, index) => {
        let title = "";
        const icons: Record<
          "search-query" | "graph" | "block" | "outline" | "mentions",
          string
        > = {
          "search-query": "panel-stats",
          graph: "graph",
          block: "symbol-circle",
          mentions: "properties",
          outline: "application",
        };
        const dom = parentEl.children[index] as HTMLDivElement;
        if (
          // @ts-ignore
          sidebarItemWindow.type === "search-query" ||
          sidebarItemWindow.type === "graph" ||
          sidebarItemWindow.type === "mentions"
        ) {
          title = (
            dom.querySelector(".rm-sidebar-window").firstElementChild
              .children[1] as HTMLDivElement
          ).innerText;
        } else {
          if (sidebarItemWindow.type === "block") {
            title = window.roamAlphaAPI.q(
              `[:find ?e . :where [?b :block/uid "${sidebarItemWindow["block-uid"]}"] [?b :block/string ?e]]`
            ) as unknown as string;
          } else {
            title = window.roamAlphaAPI.q(
              `[:find ?e . :where [?b :block/uid "${sidebarItemWindow["page-uid"]}"] [?b :node/title ?e]]`
            ) as unknown as string;
          }
        }
        return {
          ...sidebarItemWindow,
          uid: sidebarItemWindow["window-id"],
          dom,
          title,
          icon: icons[sidebarItemWindow.type],
        } as SideBarItem;
      });
  },
  async insertBlockByUid(uid: string, order: number) {
    const newUid = window.roamAlphaAPI.util.generateUID();
    const parentUids = window.roamAlphaAPI.q(`[
          :find [?e ...]
          :where
            [?b :block/uid "${uid}"]
            [?b :block/parents ?parents]
            [?parents :block/uid ?e]
        ]`) as unknown as string[];
    const parentUid = parentUids.pop();
    // console.log(parentUid, newUid, order, uid)
    await window.roamAlphaAPI.createBlock({
      block: {
        string: "",
        uid: newUid,
      },
      location: {
        "parent-uid": parentUid,
        order: order,
      },
    });
    return { newUid, parentUid };
  },
  async selectingBlockByUid(
    uid: string,
    shiftKeyPressed: boolean,
    parentUid = uid
  ) {
    if (shiftKeyPressed) {
      window.roamAlphaAPI.ui.rightSidebar.addWindow({
        window: { type: "block", "block-uid": uid },
      });
      return;
    }
    await window.roamAlphaAPI.ui.mainWindow.openBlock({
      block: {
        uid: parentUid,
      },
    });
    await delay(250);
    // TOOD: just focus on it
    window.roamAlphaAPI.ui.setBlockFocusAndSelection({
      location: {
        "block-uid": uid,
        "window-id": "main-window",
      },
    });
  },
  getAllTaggedBlocks() {
    window.roamAlphaAPI.q(`
[
    :find (pull ?children [*])
    :where
      [?p :block/uid "02-22-2023"]
      [?children :block/page ?p]
      [?children :block/refs ?refs]
]
`);
  },
  async getFocusedBlockUid() {
    return await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
  },
  getCurrentPageFullTreeByUid(uid: string) {
    const sortByOrder = (node: TreeNode3) => {
      const _sortByOrder = (_node: TreeNode3) => {
        _node.children = _node.children
          ? _node.children.map(_sortByOrder).sort(orderSort)
          : [];
        return _node;
      };

      const orderSort = (a: TreeNode3, b: TreeNode3) => {
        return a.order - b.order;
      };
      if (node.children)
        node.children = node.children.map(_sortByOrder).sort(orderSort);
      return node;
    };
    console.time("CurrentPage");
    const tree = window.roamAlphaAPI.q(`[:find (pull ?b [
      [:block/string :as "text"]
      :block/uid 
      :block/order 
      :block/heading 
      { :block/refs [:block/string :node/title :block/uid] }
      :block/open 
      :block/parents
      [:children/view-type :as "viewType"] 
      [:block/text-align :as "textAlign"] 
      [:edit/time :as "editTime"] 
      :block/props 
      {:block/children ...}
    ]) . :where [?b :block/uid "${uid}"]]`) as unknown as TreeNode3;
    console.timeEnd("CurrentPage");
    return sortByOrder(tree);
  },
  recordPageAndScrollPosition() {
    oldHref = location.href;

    console.log("record: ", oldHref);
  },
  restorePageAndScrollPosition() {
    console.log("restoring: ", oldHref);
    setTimeout(() => {
      location.replace(oldHref);
    }, 20);
  },
  async focusOnBlockWithoughtHistory(uid: string) {
    const hashes = location.hash.split("/");
    hashes.pop();
    hashes.push(uid);
    const newHash = hashes.join("/");
    var newUrl = location.origin + newHash;
    // console.log(newUrl, newHash, ' newUrl');
    await delay(10);
    // location.replace(newUrl);
    await delay(10);

    // window.roamAlphaAPI.ui.mainWindow.openBlock({
    //   block: {
    //     uid
    //   }
    // })
  },
};

type PassProps = {
  itemPredicate?: (query: string, item: unknown) => boolean;
  items: (v: any) => (TreeNode3 | SideBarItem)[];
  itemRenderer: ItemRenderer<unknown>;
  onItemSelect?: (v: any) => void;
};

export type RightMenuType =
  | "top"
  | "right"
  | "bottom"
  | "switch"
  | "remove"
  | "switch-swap";
export type OnRightMenuClick2 = (
  item: SideBarItem | TreeNode3,
  type: RightMenuType,
  e: React.MouseEvent<HTMLElement>
) => void;

type OnRightMenuClick = (
  type: RightMenuType,
  e: React.MouseEvent<HTMLElement>
) => void;

const RightMenu: FC<{
  onClick: OnRightMenuClick;
}> = (props) => {
  return (
    <div className="right-menu">
      <ButtonGroup>
        <Tooltip content={<span>Insert a block above</span>}>
          <Button icon="add-row-top" onClick={(e) => props.onClick("top", e)} />
        </Tooltip>

        <Tooltip content={<span>Insert a block below</span>}>
          <Button
            icon="add-row-bottom"
            onClick={(e) => props.onClick("bottom", e)}
          />
        </Tooltip>
        <Tooltip content={<span>Open in sidebar</span>}>
          <Button
            icon="arrow-right"
            onClick={(e) => props.onClick("right", e)}
          />
        </Tooltip>
      </ButtonGroup>
    </div>
  );
};

const SidebarRightMenu: FC<{
  onClick: OnRightMenuClick;
}> = (props) => {
  return (
    <div className="right-menu">
      <ButtonGroup>
        <Tooltip content={<span>Switching in sidebar</span>}>
          <Button
            icon="swap-horizontal"
            onClick={(e) => props.onClick("switch-swap", e)}
          />
        </Tooltip>
        <Tooltip content={<span>Toggle in sidebar</span>}>
          <Button
            icon="segmented-control"
            onClick={(e) => props.onClick("switch", e)}
          />
        </Tooltip>
        <Tooltip content={<span>Remove from sidebar</span>}>
          <Button
            icon="small-cross"
            onClick={(e) => props.onClick("remove", e)}
          />
        </Tooltip>
      </ButtonGroup>
    </div>
  );
};

export default function Extension(props: {
  isOpen: boolean;
  onClose: () => void;
}) {}

const toast = Toaster.create({});
function BlockDiv(props: { uid: string; "zoom-path"?: boolean }) {
  const ref = useRef<HTMLDivElement>();
  useEffect(() => {
    window.roamAlphaAPI.ui.components.renderBlock({
      uid: props.uid,
      el: ref.current,
      // @ts-ignore
      "zoom-path?": props["zoom-path"],
    });
  }, []);
  return <div ref={ref} />;
}

let lastedCloseTime: number;

const isFetchAgainIn5Seconds = () => {
  if (!lastedCloseTime) {
    lastedCloseTime = Date.now();
  } else {
    if (Date.now() - lastedCloseTime < (1000 & 5)) {
      console.log(" not now");
      return true;
    }
  }
  return false;
};

let AppIsOpen = false;

// 模式选项
const modeOptions: Array<{
  value: string;
  label: string;
  icon: IconName;
  hint: string;
}> = [
  { value: "", label: "Default", icon: "search", hint: "" },
  { value: "l:", label: "Line Mode", icon: "list", hint: "" },
  { value: "@:", label: "Tag Mode", icon: "tag", hint: "" },
  {
    value: "r:",
    label: "Sidebar Mode",
    icon: "panel-stats",
    hint: "",
  },
  {
    value: "e:",
    label: "Recent Edits",
    icon: "time",
    hint: "changes in 48 hours",
  },
];

// 模式选择器组件
const ModeSelector: FC<{
  mode: string;
  modeSelectorOpen: boolean;
  setModeSelectorOpen: (open: boolean) => void;
  resetInputWithMode: (nextMode: string) => Promise<void>;
  inputRef: React.RefObject<HTMLInputElement>;
}> = ({
  mode,
  modeSelectorOpen,
  setModeSelectorOpen,
  resetInputWithMode,
  inputRef,
}) => {
  const currentModeOption =
    modeOptions.find((opt) => opt.value === mode) || modeOptions[0];

  return (
    <Popover
      isOpen={modeSelectorOpen}
      onInteraction={(nextOpenState) => setModeSelectorOpen(nextOpenState)}
      content={
        <Menu>
          {modeOptions.map((option) => (
            <MenuItem
              key={option.value}
              icon={option.value === mode ? "tick" : option.icon}
              text={option.label}
              active={option.value === mode}
              labelElement={
                option.hint ? (
                  <span style={{ fontSize: "12px", opacity: 0.6 }}>
                    <span> {option.hint}</span>
                  </span>
                ) : undefined
              }
              onClick={async () => {
                setModeSelectorOpen(false);
                await resetInputWithMode(option.value);
                inputRef.current?.focus();
              }}
            />
          ))}
        </Menu>
      }
      position={Position.BOTTOM_LEFT}
      minimal
    >
      <Button
        icon={currentModeOption.icon}
        minimal
        small
        rightIcon="caret-down"
        onClick={() => setModeSelectorOpen(!modeSelectorOpen)}
      />
    </Popover>
  );
};

function App(props: { extensionAPI: RoamExtensionAPI }) {
  const [isOpen, setOpen] = useState(false);
  const [mode, setMode] = useState<string>("");
  // const [query, setQuery] = useState("");
  const zoomStacks = useZoomStacks();
  const { query, sources } = zoomStacks.currentStack();

  const inputRef = useRef<HTMLInputElement>();
  const refs = useRef({
    query: "",
    isClosing: false,
  });
  refs.current.query = query;
  console.log({ mode }, " = query");

  const getSidebarModeData = async () => {
    console.time("Sidebar");
    await delay(20);
    const rightSidebarItems = await api.getRightSidebarItems();
    const result = rightSidebarItems.concat([
      {
        dom: {},
        type: "custom",
        title: "Clear Sidebar",
        uid: "clean-sidebar",
        icon: "remove",
        onClick() {
          rightSidebarItems.forEach((item) => {
            onRightMenuClick(item, "remove", {
              preventDefault: () => {},
              stopPropagation: () => {},
            } as React.MouseEvent<HTMLElement>);
          });
        },
      },
    ] as SideBarItem[]);
    console.timeEnd("Sidebar");
    return result;
  };
  const initData = async () => {
    api.recordPageAndScrollPosition();

    console.log(Date.now() - lastedCloseTime < 10000, " ---@=");

    if (isFetchAgainIn5Seconds()) {
      return;
    }
    console.time("init");
    console.time("Source");

    const pageUid = getPageUid();
    api;
    await zoomStacks.open(pageUid, getStringByUid(pageUid));
    // setTree(withParents(roamApi.getCurrentPageFullTreeByUid(pageUid) as TreeNode3, []));
    // const flatted = flatTree(api.getCurrentPageFullTreeByUid(pageUid));
    // console.timeEnd('Source')

    // setSources({
    //   lineMode: flatted[1].filter(item => item.text),
    //   strMode: flatted[1].filter(item => item.text),
    //   tagMode: flatted[2].filter(item => item.text),
    //   sidebarMode: [], // getSidebarModeData(),
    //   changedMode: api.getAllChangesWithin2Day()
    // });

    console.timeEnd("init");

    // 默认
    // setPassProps(defaultFn(""));
  };

  const resetInputWithMode = async (nextMode: string) => {
    setMode(nextMode);
    setActiveItem(undefined);
    // 保持当前的 query 值不变，只更新 mode
    findActiveItem();
    await delay(100);
    inputRef.current?.focus();
  };
  const openSidebar = async () => {
    await api.openRightsidebar();
    const sidebarMode = await getSidebarModeData();
    zoomStacks.changeSidebarMode(sidebarMode);
    await delay(20);
  };
  useEffect(() => {
    props.extensionAPI.ui.commandPalette.addCommand({
      label: "Open Switch+",
      "default-hotkey": ["super-shift-p"],
      async callback() {
        if (inPageCheck()) {
          return;
        }
        if (!AppIsOpen) {
          await initData();
        }
        open();
      },
    });
    props.extensionAPI.ui.commandPalette.addCommand({
      label: "Open Switch+ in Tag Mode",
      // "default-hotkey": ['super-shift-o'],
      async callback() {
        if (inPageCheck()) {
          return;
        }
        if (!AppIsOpen) {
          await initData();
        }
        open();
        resetInputWithMode("@:");
      },
    });
    props.extensionAPI.ui.commandPalette.addCommand({
      label: "Open Switch+ in Line Mode",
      // "default-hotkey": ['super-shift-l'],
      async callback() {
        if (inPageCheck()) {
          return;
        }
        if (!AppIsOpen) {
          await initData();
        }
        open();
        resetInputWithMode("l:");
      },
    });
    props.extensionAPI.ui.commandPalette.addCommand({
      label: "Open Switch+ in Sidebar Mode",
      // "default-hotkey": ['super-shift-u'],
      async callback() {
        if (inPageCheck()) {
          return;
        }
        await openSidebar();
        open();
        resetInputWithMode("r:");
      },
    });
    props.extensionAPI.ui.commandPalette.addCommand({
      label: "Open Switch+ in Latest Edit Mode",
      // "default-hotkey": ['super-shift-e'],
      async callback() {
        if (inPageCheck()) {
          return;
        }
        if (!AppIsOpen) {
          await initData();
        }
        open();
        resetInputWithMode("e:");
      },
    });
  }, []);

  const open = async () => {
    AppIsOpen = true;
    refs.current.isClosing = false;
    setOpen(true);
    setTimeout(() => {
      AppIsOpen = false;
    }, 120);
  };

  const [passProps, setPassProps] = useState<PassProps>({
    items: () => [],
    itemRenderer: () => <></>,
    onItemSelect: () => {},
  });

  const sidebarSwitch = async (item: SideBarItem) => {
    doSwitch(item as any);
    await openSidebar();
    inputRef.current?.focus();
    api.recordPageAndScrollPosition();
  };

  const onRightMenuClick: OnRightMenuClick2 = async (item, type, e) => {
    e.preventDefault();
    e.stopPropagation();
    const handles = {
      right: () => {
        api.selectingBlockByUid(item.uid, true);
      },
      top: async () => {
        changeSelected(!e.shiftKey);
        const newUid = await api.insertBlockByUid(item.uid, item.order);
        api.selectingBlockByUid(newUid.newUid, e.shiftKey, newUid.parentUid);
        onDialogClose();
      },
      bottom: async () => {
        changeSelected(!e.shiftKey);
        const newUid = await api.insertBlockByUid(item.uid, item.order + 1);
        api.selectingBlockByUid(newUid.newUid, e.shiftKey, newUid.parentUid);
        onDialogClose();
      },
      switch: () => {
        api.toggleSidebarWindow(item as SideBarItem);
      },
      "switch-swap": () => {
        sidebarSwitch(item as SideBarItem);
      },

      remove: () => {
        api.removeSidebarWindow(item as SideBarItem);
        zoomStacks.changeSidebarMode(
          sources.sidebarMode.filter((_m) => {
            return _m.uid !== item.uid;
          })
        );

        // setSources(prev => {
        //   return {
        //     ...prev,
        //     sidebarMode: prev.sidebarMode.filter(_m => {
        //       return _m.uid !== item.uid
        //     })
        //   }
        // })
      },
    };
    await handles[type]();
  };
  // 记录当前网址和滑动的距离
  //
  const defaultFn = (str: string) => {
    // 查询的是字符串
    return {
      items: (_sources: typeof sources) => _sources.strMode,
      itemPredicate: (query: string, item: TreeNode) => {
        // console.log(item, ' ---- ', str ? 1 : 2, query)
        if (!query) {
          return true;
        }
        return str
          ? item.text.toLowerCase().includes(str.toLowerCase())
          : false;
      },
      itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
        // console.log(item, ' = render', itemProps)
        return (
          <MenuItem
            style={{
              paddingLeft: (item.parents?.length || 0) * 15,
            }}
            {...itemProps.modifiers}
            text={
              <SwitchResultItem
                item={item}
                itemProps={itemProps}
                query={str}
                onRightMenuClick={onRightMenuClick}
              />
            }
            onClick={(e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true);
                return;
              }
              setActiveItemByItem(item);
            }}
            onDoubleClick={(e) => {
              itemProps.handleClick(e);
            }}
          ></MenuItem>
        );
      },
    };
  };
  const modes: Record<string, (str: string) => PassProps> = {
    "l:": (str) => {
      // console.log(str, ' line mode', sources.lineMode)
      return {
        itemPredicate(query: string, item: TreeNode3) {
          return (
            item.deep.startsWith(str) ||
            item.deep.split(".").join("").startsWith(str)
          );
        },
        items: (_sources: typeof sources) => _sources.lineMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          return (
            <MenuItem
              {...itemProps.modifiers}
              text={
                <div
                  className={`switch-result-item 
                               ${
                                 itemProps.modifiers.active
                                   ? "switch-result-item-active"
                                   : ""
                               }
                               `}
                >
                  <div className="deep">{highlightText(item.deep, str)}</div>
                  <div className="ellipsis">{item.text}</div>
                  <RightMenu
                    onClick={(type, e) => onRightMenuClick(item, type, e)}
                  />
                </div>
              }
              onClick={(e) => {
                if (e.shiftKey) {
                  api.selectingBlockByUid(item.uid, true);
                  return;
                }
                setActiveItemByItem(item);
              }}
              onDoubleClick={(e) => {
                itemProps.handleClick(e);
              }}
            ></MenuItem>
          );
        },
      };
    },
    "@:": (str) => {
      return {
        itemPredicate(query, item: TreeNode3) {
          return item.tags.some((ref) =>
            ref.text.toLowerCase().includes(str.toLowerCase())
          );
        },
        items: (_sources: typeof sources) => _sources.tagMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          return (
            <MenuItem
              {...itemProps.modifiers}
              text={
                <div
                  className={`switch-result-item tag-mode
                               ${
                                 itemProps.modifiers.active
                                   ? "switch-result-item-active"
                                   : ""
                               }
                               `}
                >
                  {item.tags
                    // ?.filter(ref => {
                    //   return ref.text.includes(str)
                    // })
                    ?.map((ref) => {
                      console.log(ref, " ---- tags");
                      return (
                        <Tag
                          icon={
                            ref.type === "page" ? (
                              <span className="rm-icon-key-prompt">{`[[`}</span>
                            ) : (
                              <span className="rm-icon-key-prompt">{`((`}</span>
                            )
                          }
                          className="rm-page-ref--tag"
                        >
                          {highlightText(ref.text, str)}
                        </Tag>
                      );
                    })}

                  <RightMenu
                    onClick={(type, e) => onRightMenuClick(item, type, e)}
                  />
                </div>
              }
              onClick={(e) => {
                if (e.shiftKey) {
                  api.selectingBlockByUid(item.uid, true);
                  return;
                }
                setActiveItemByItem(item);
              }}
              onDoubleClick={(e) => {
                itemProps.handleClick(e);
              }}
            ></MenuItem>
          );
        },
      };
    },
    "s:": defaultFn,
    "r:": (str) => {
      return {
        items: (_sources: typeof sources) => _sources.sidebarMode,
        itemPredicate(query, item: SideBarItem) {
          return item.title.toLowerCase().includes(str.toLowerCase());
        },
        itemRenderer(item: SideBarItem, itemProps: IItemRendererProps) {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          let content = (
            <>
              <Button
                icon={item.icon}
                active={false}
                fill
                minimal
                alignText="left"
                text={
                  <span
                    style={{
                      color: itemProps.modifiers.active ? "white" : "inherit",
                    }}
                  >
                    {item.title}
                  </span>
                }
                rightIcon={
                  <SidebarRightMenu
                    onClick={(type, e) => {
                      onRightMenuClick(item, type, e);
                    }}
                  />
                }
              />
            </>
          );
          if (item.type === "custom") {
            content = (
              <>
                <Button
                  icon={item.icon}
                  fill
                  minimal
                  alignText="left"
                  text={item.title}
                />
              </>
            );
          }
          return (
            <MenuItem
              {...itemProps.modifiers}
              text={
                <div
                  className={`switch-result-item ${
                    itemProps.modifiers.active
                      ? "switch-result-item-active"
                      : ""
                  }`}
                >
                  {content}
                </div>
              }
              onClick={
                item.type === "custom"
                  ? itemProps.handleClick
                  : (e) => {
                      setActiveItem(item);
                      focusSidebarWindow(item);
                    }
              }
            ></MenuItem>
          );
        },
      };
    },
    "e:": (str) => {
      return {
        items: (_sources: typeof sources) => _sources.changedMode,
        itemPredicate(query, item: TreeNode3) {
          return item.string.toLowerCase().includes(str.toLowerCase());
        },
        itemRenderer(item: TreeNode3, itemProps: IItemRendererProps) {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          let content = (
            <>
              <Button
                active={false}
                fill
                minimal
                alignText="left"
                text={highlightText(item.string, str)}
                rightIcon={
                  <div className="right-menu">
                    <Tooltip content={<span>Open in sidebar</span>}>
                      <Button
                        icon="arrow-right"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          api.selectingBlockByUid(item.uid, true);
                        }}
                      />
                    </Tooltip>
                  </div>
                }
              />
            </>
          );
          return (
            <MenuItem
              {...itemProps.modifiers}
              text={
                <div
                  className={`switch-result-item
                               ${
                                 itemProps.modifiers.active
                                   ? "switch-result-item-active"
                                   : ""
                               }
                               `}
                  style={{ alignItems: "end" }}
                >
                  {content}
                  <small
                    style={{ minWidth: 110, opacity: 0.6, textAlign: "end" }}
                  >
                    {formatDate(new Date(item.time))}
                  </small>
                </div>
              }
              onClick={(e) => {
                if (e.shiftKey) {
                  api.selectingBlockByUid(item.uid, true);
                  return;
                }
                setActiveItemByItem(item);
              }}
              onDoubleClick={(e) => {
                itemProps.handleClick(e);
              }}
            ></MenuItem>
          );
        },
      };
    },
  };
  function setActiveItemByItem(item: TreeNode3 | SideBarItem) {
    setActiveItem(item);
    madeActiveItemChange(item);
  }

  const itemsSource = passProps.items(sources);

  const findActiveItem = useEvent(async () => {
    const uid = oldHref.split("/").pop();
    let activeItem = itemsSource.find((item) => item.uid === uid);
    // console.log(uid, ' = uid item', activeItem)
    if (!activeItem) {
      activeItem = itemsSource[0];
    }
    setActiveItem(activeItem);
    madeActiveItemChange(activeItem, true);
  });

  const focusSidebarWindow = async (item: SideBarItem) => {
    if (refs.current.isClosing || !item) {
      return;
    }
    setTimeout(() => {
      item.dom?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }, 10);

    console.log("dom; ", item);
  };

  // const focusOnItem = async (item: TreeNode3) => {
  //   if (await api.checkIsUnderCurrentBlock(item)) {
  // api.focusOnBlock(item)
  //     return true;
  //   }
  // }
  const madeActiveItemChange = async (
    item: TreeNode3 | SideBarItem,
    immediately = false
  ) => {
    await delay(10);
    // console.log(item, ' --- delay')
    if (isSidebarItem(item)) {
      focusSidebarWindow(item);
      return;
    }

    // if (await focusOnItem(item)) {
    // return
    // }
    scrollToActiveItem(item, immediately);
    await api.focusOnBlockWithoughtHistory(item.uid);
    inputRef.current.focus();
  };
  useEffect(() => {
    if (isOpen) {
    } else {
      setTimeout(() => {
        zoomStacks.clean();
        changeSelected(false);
      }, 20);
    }
  }, [isOpen]);
  const selected = useRef(false);
  function changeSelected(next: boolean) {
    selected.current = next;
  }
  const handleClose = () => {
    refs.current.isClosing = true;
    setOpen(false);
    lastedCloseTime = Date.now();
  };
  const onDialogClose = () => {
    // api.clearHistory
    console.log("on close: 1", selected);
    if (!selected.current) {
      api.restorePageAndScrollPosition();
    }
    handleClose();
  };

  const [activeItem, setActiveItem] = useState<TreeNode3 | SideBarItem>();

  // 当 mode 改变时，更新 passProps
  useEffect(() => {
    if (mode === "r:") {
      openSidebar();
    }
    const fn = modes[mode] || defaultFn;
    setPassProps(fn(query.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleQueryChange(_query: string) {
    // 检测 query 是否以某个 mode 开头，如果匹配则切换 mode
    // 按长度降序排列，先匹配较长的 mode（如 "r:"、"e:"、"s:"），再匹配较短的（如 ":"、"@"）
    const modeKeys = Object.keys(modes).sort((a, b) => b.length - a.length);
    const matchedMode = modeKeys.find((modeKey) => _query.startsWith(modeKey));

    let actualQuery = _query;
    let currentMode = mode;
    let modeChanged = false;

    // 如果匹配到 mode 且与当前 mode 不同，则切换 mode 并保留非 mode 关键字的内容
    if (matchedMode && matchedMode !== currentMode) {
      currentMode = matchedMode;
      setMode(matchedMode);
      actualQuery = _query.substring(matchedMode.length); // 保留移除 mode 前缀后的内容
      modeChanged = true;
    }

    // console.log('handle query change: ', actualQuery, currentMode)
    const fn = modes[currentMode] || defaultFn;
    // query 不再包含 mode 前缀，直接使用
    setPassProps(fn(actualQuery.trim()));
    // setQuery(actualQuery)
    console.log({ _query, actualQuery, currentMode, modeChanged }, " = query");
    zoomStacks.changeQuery(actualQuery);
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const filteredItems = useRef<(TreeNode3 | SideBarItem)[]>([]);
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);
  let scrollToActiveItem = (item: { uid: string }, immediately: boolean) => {};
  console.log(query, passProps, itemsSource);
  const isRightSidebarMode = mode === "r:";

  // 切换模式（用于键盘导航）
  const switchMode = (direction: "up" | "down") => {
    console.log(mode, " = mode switchMode");
    const currentIndex = modeOptions.findIndex((opt) => opt.value === mode);
    let nextIndex: number;

    if (direction === "down") {
      nextIndex = (currentIndex + 1) % modeOptions.length;
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = modeOptions.length - 1;
      }
    }

    const nextMode = modeOptions[nextIndex].value;
    resetInputWithMode(nextMode);
  };

  // 当模式选择器打开时，使用 window 级别的键盘监听
  useEffect(() => {
    if (!modeSelectorOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // 上下键切换模式
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        switchMode(e.key === "ArrowDown" ? "down" : "up");
        return;
      }
      // Escape 键关闭模式选择器
      if (
        e.key === "Escape" &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        setModeSelectorOpen(false);
        inputRef.current?.focus();
        return;
      }
      // Enter 键确认选择并关闭
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        e.stopPropagation();

        setTimeout(() => {
          setModeSelectorOpen(false);
          inputRef.current?.focus();
        }, 100);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modeSelectorOpen, mode]);

  return (
    <div>
      <Omnibar<TreeNode3 | SideBarItem>
        className={`${ID} ${isRightSidebarMode ? `${ID}-sidebar-mode` : ""}`}
        isOpen={isOpen}
        scrollToActiveItem
        activeItem={activeItem}
        inputProps={{
          leftElement: (
            <ModeSelector
              mode={mode}
              modeSelectorOpen={modeSelectorOpen}
              setModeSelectorOpen={setModeSelectorOpen}
              resetInputWithMode={resetInputWithMode}
              inputRef={inputRef}
            />
          ),
          inputRef: inputRef,
          placeholder: "Search...",
          onBlur() {
            // console.log(" blur")
          },
          onKeyDownCapture(e) {
            // 如果模式选择器打开，拦截 Enter 键，防止触发列表选择
            if (
              modeSelectorOpen &&
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            // 检测 "/" 键，打开模式选择器
            if (
              e.key === "/" &&
              !e.shiftKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              e.stopPropagation();
              setModeSelectorOpen(true);
              return;
            }

            // 如果光标在第一位时按删除键，则回到普通模式
            if (
              e.key === "Backspace" &&
              inputRef.current &&
              inputRef.current.selectionStart === 0 &&
              mode !== "" &&
              !e.shiftKey &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              e.stopPropagation();
              setMode("");
              return;
            }
            // 侧边栏模式不进去.
            if (activeItem && "dom" in activeItem) {
              if (e.key === "Tab") {
                sidebarSwitch(activeItem);
              }
              return;
            }

            if (e.key === "Tab") {
              if (e.shiftKey) {
                zoomStacks.zoomOut();
              } else {
                zoomStacks.zoomIn(activeItem.uid);
              }
              e.preventDefault();
              e.stopPropagation();
            }
          },
        }}
        onClose={(e) => {
          onDialogClose();
        }}
        onItemSelect={async (item: TreeNode3 | SideBarItem, e) => {
          // 如果模式选择器打开，不触发列表选择
          if (modeSelectorOpen) {
            return;
          }
          console.log(item, modeSelectorOpen, " = item onItemSelect");

          if (isSidebarItem(item)) {
            if (item.type === "custom") {
              item.onClick();
            }
            onDialogClose();
            return;
          }
          const shiftKeyPressed = (e as any).shiftKey;
          changeSelected(!shiftKeyPressed);
          onDialogClose();
          if (mode === "e:") {
          }
          // if (!await focusOnItem(item)) {
          api.selectingBlockByUid(item.uid, shiftKeyPressed);
          // }
        }}
        {...passProps}
        itemRenderer={(item, itemProps) => {
          return passProps.itemRenderer(item, {
            ...itemProps,
            handleClick: (e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true);
              } else {
                itemProps.handleClick(e);
              }
            },
          });
        }}
        items={itemsSource}
        onQueryChange={(query) => {
          handleQueryChange(query);
        }}
        onActiveItemChange={(_activeItem: TreeNode3 | SideBarItem) => {
          if (!_activeItem) {
            return;
          }
          if (modeSelectorOpen) {
            return;
          }

          // right side bar mode
          if ("dom" in _activeItem) {
            setActiveItem(_activeItem);
            scrollToActiveItem(_activeItem, true);
            focusSidebarWindow(_activeItem);
            return;
          }

          if (selected.current || refs.current.isClosing || AppIsOpen) {
            return;
          }
          setActiveItemByItem(_activeItem);
        }}
        resetOnQuery
        resetOnSelect
        query={query}
        noResults={<MenuItem disabled={true} text="No results." />}
        itemListRenderer={(itemListProps) => {
          filteredItems.current = itemListProps.filteredItems;
          scrollToActiveItem = (node: { uid: string }, immediately = false) => {
            const index = filteredItems.current.findIndex(
              (item) => item.uid === node.uid
            );
            virtuosoRef.current?.scrollIntoView({
              index,
              behavior: immediately ? "auto" : "smooth",
              align: "center",
            });
            // console.log(index, ' = index', itemListProps.activeItem, node, filteredItems.current)
          };

          return (
            <div>
              <div className="zoom-stack-container">
                <Tooltip
                  content={<span>click or use Shift+Tab to zoom in/out</span>}
                >
                  {zoomStacks.stacks.length <= -1 ? null : (
                    <div>
                      <div className="rm-zoom zoom-path-view">
                        {zoomStacks.stacks.map((stack, index, arr) => {
                          return (
                            <div
                              className="rm-zoom-item"
                              style={{ position: "relative" }}
                              onClick={() => {
                                zoomStacks.zoomTo(stack.uid);
                              }}
                            >
                              <span className="rm-zoom-item-content">
                                {stack.text}
                              </span>
                              <Icon icon="chevron-right" />
                              {index === arr.length - 1 ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    display: "flex",
                                    inset: 0,
                                  }}
                                >
                                  <div className="rm-zoom-mask" />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Tooltip>
              </div>
              <div className="flex" style={{ maxHeight: 500 }}>
                <Menu>
                  <Virtuoso
                    ref={virtuosoRef}
                    style={{ height: "500px" }}
                    totalCount={itemListProps.filteredItems.length}
                    itemContent={(index) => {
                      return itemListProps.renderItem(
                        itemListProps.filteredItems[index],
                        index
                      );
                    }}
                  />
                </Menu>
                <Preview
                  uid={
                    itemListProps.filteredItems.length > 0
                      ? activeItem?.uid
                      : undefined
                  }
                  key={activeItem?.uid}
                />
              </div>
              <Hints
                total={itemListProps.items.length}
                filtered={itemListProps.filteredItems.length}
              />
            </div>
          );
        }}
        overlayProps={{
          portalClassName: isOpen ? "open-portal" : "close-portal",
        }}
      />
    </div>
  );
}
function getPageUid() {
  const pageOrBlockUid = oldHref.split("/").pop();

  const pageUid =
    (window.roamAlphaAPI.q(`[
        :find ?e .
        :where
          [?b :block/uid "${pageOrBlockUid}"]
          [?b :block/page ?p]
          [?p :block/uid ?e]
      ]`) as unknown as string) || pageOrBlockUid;
  return pageUid;
}

function Hints(props: { total: number; filtered: number }) {
  return (
    <div className={`${ID}-hints`}>
      <span>
        {props.filtered}/{props.total} total
      </span>

      <span>
        <span className="hint-icon">@:</span>
        <span> refs mode </span>
      </span>
      <span>
        <span className="hint-icon">l:</span>
        <span> lines mode </span>
      </span>
      <span>
        <span className="hint-icon">r:</span>
        <span> sidebar mode </span>
      </span>
      <span>
        <span className="hint-icon">e:</span>
        <span> changes in 48 hours </span>
      </span>
    </div>
  );
}

function Preview({ uid }: { uid: string }) {
  const ref = useRef<HTMLDivElement>();
  console.log(uid, " = preview uid");
  useEffect(() => {
    let unmounted = false;
    if (uid) {
      setTimeout(() => {
        if (unmounted) {
          return;
        }
        window.roamAlphaAPI.ui.components.renderBlock({
          uid,
          el: ref.current,
        });
      }, 250);

      return () => {
        unmounted = true;
      };
    } else {
      // @ts-ignore
      window.roamAlphaAPI.ui.components.unmountNode({
        uid,
        el: ref.current,
      });
    }
    return () => {};
  }, [uid]);
  return (
    <div className={`${ID}-preview`}>
      <div ref={ref} />
    </div>
  );
}

const ID = "rm-switches";
export function initExtension(extensionAPI: RoamExtensionAPI) {
  let roamEl = document.querySelector(".roam-app");
  let el = document.querySelector("#" + ID);
  if (el) {
    el.parentElement.removeChild(el);
  }
  el = document.createElement("div");
  el.id = ID;
  roamEl.appendChild(el);
  ReactDOM.render(<App extensionAPI={extensionAPI} />, el);
  extension_helper.on_uninstall(() => {
    roamEl.removeChild(el);
  });
  initSwitchBetweenSidebarAndMain(extensionAPI);
}

function flatTree(node: TreeNode3) {
  console.log(node, " = node");
  const lineBlocks: TreeNode3[] = [];
  const blocks: TreeNode3[] = [];
  const taggedBlocks: TreeNode3[] = [];

  const flat = (_node: TreeNode2, deep: string, deepInt: number) => {
    // lineMode.set(deep, _node);
    _node.deep = deep;
    blocks.push(_node as unknown as TreeNode3);
    if (_node.refs) {
      const replacedString = replaceBlockReference(_node.text, _node.refs);
      _node.text = replacedString;
      taggedBlocks.push({
        ..._node,
        tags: _node.refs.map((ref) => {
          // console.log(ref, ' = ref')
          return {
            text: (ref.title || ref.string) as unknown as string,
            type: ref.title ? "page" : "block",
          };
        }),
      });
    }
    _node.children?.forEach((childNode, index) => {
      flat(childNode, deep + "." + (index + 1), deepInt + 1);
    });
  };

  node.children?.forEach((childNode, index) => {
    flat(childNode, index + 1 + "", 0);
  });
  return [lineBlocks, blocks, taggedBlocks] as const;
}

export function replaceBlockReference(
  source: string,
  refs: { string?: string; title?: string; uid: string }[]
) {
  const refReg = /(\()([^\{\}\s\)\(]{9,})?\)/gi;
  let lastIndex = 0;
  let result = "";
  while (true) {
    const match = refReg.exec(source);
    if (!match) {
      break;
    }
    const length = match[0].length;
    const before = source.slice(lastIndex, refReg.lastIndex - length);
    if (before.length > 0) {
      result += before;
    }
    lastIndex = refReg.lastIndex;
    // console.log(match, result, lastIndex, source);
    const found = refs.find((r) => r.uid === match[2]);
    result += found?.string || found?.title || match[2];
  }
  // console.log(source, " -- source");
  const rest = source.slice(lastIndex);
  if (rest) {
    result += rest;
  }
  return result;
}

function getRefStringByUid(uid: string) {
  const block = window.roamAlphaAPI.pull("[:block/string]", [
    ":block/uid",
    uid,
  ]);
  return block ? block[":block/string"] : "";
}

function getPageTitleByUid(uid: string) {
  const block = window.roamAlphaAPI.pull("[:node/title]", [":block/uid", uid]);
  return block ? block[":node/title"] : "";
}

function getStringByUid(uid: string) {
  return getPageTitleByUid(uid) || getRefStringByUid(uid);
}

function inPageCheck() {
  if (!window.location.href.includes("/page/")) {
    toast.show(
      {
        message: "Switch+ only works in a specific page",
        intent: "warning",
        icon: "hand",
      },
      "switch+warning"
    );
    return true;
  }
}

type ZoomSources = {
  lineMode: TreeNode3[];
  strMode: TreeNode3[];
  tagMode: TreeNode3[];
  sidebarMode: SideBarItem[];
  changedMode: TreeNode3[];
};

type ZoomState = {
  uid: string;
  query: string;
  sources: ZoomSources;
  text: string;
};

const sourceMap = new Map<string, ZoomSources>();

function useZoomStacks() {
  const [stacks, setStacks] = useState<ZoomState[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SideBarItem[]>([]);
  const [parents, setParents] = useState<
    { uid: string; text: string; query?: string }[]
  >([]);

  const getSourceByUid = (uid: string) => {
    const flatted = flatTree(api.getCurrentPageFullTreeByUid(uid));
    return {
      lineMode: flatted[1].filter((item) => item.text),
      strMode: flatted[1].filter((item) => item.text),
      tagMode: flatted[2].filter((item) => item.text),
      sidebarMode: [] as SideBarItem[], // getSidebarModeData(),
      changedMode: api.getAllChangesWithin2Day(),
    };
  };

  const result = {
    clean() {
      // setStacks(stacks.slice(0, 1))
    },
    async open(uid: string, text: string) {
      sourceMap.clear();
      return result.zoomIn(uid, text);
    },
    async zoomIn(uid: string, text?: string) {
      const parents = getParentsStrFromBlockUid(uid);
      const source = getSourceByUid(uid);
      sourceMap.set(uid, source);
      setParents((prevParents) => {
        return parents.map((parent) => {
          return {
            ...parent,
            query:
              prevParents.find((pItem) => pItem.uid === parent.uid)?.query ||
              "",
          };
        });
      });
    },
    changeQuery(query: string) {
      setParents((prev) => {
        prev[prev.length - 1].query = query;
        return [...prev];
      });
    },
    zoomOut() {
      if (parents.length <= 1) {
        return;
      }
      console.log("zoom out: ", stacks);
      // const newParents = parents.slice(0, stacks.length - 1)
      parents.pop();
      result.zoomIn(parents[parents.length - 1].uid);
    },
    changeSidebarMode(data: SideBarItem[]) {
      setSidebarMode(data);
    },
    currentStack() {
      const cur = parents[parents.length - 1];

      if (!sourceMap.has(cur?.uid)) {
        return {
          query: "",
          sources: {
            lineMode: [],
            strMode: [],
            tagMode: [],
            sidebarMode: [] as SideBarItem[], // getSidebarModeData(),
            changedMode: [],
          } as ZoomSources,
        };
      }

      return {
        query: cur.query || "",
        sources: {
          ...sourceMap.get(cur.uid),
          sidebarMode: sidebarMode,
        },
      };
    },
    get stacks() {
      return parents;
    },
    zoomTo(uid: string) {
      result.zoomIn(uid);
    },
  };

  return result;
}
