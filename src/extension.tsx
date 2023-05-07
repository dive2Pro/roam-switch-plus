import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from 'react-dom';
import { Button, ButtonGroup, Icon, IconName, InputGroup, Menu, MenuItem, Tag, Toaster, Tooltip } from "@blueprintjs/core";
import { IItemRendererProps, ItemRenderer, Omnibar } from "@blueprintjs/select";
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import "./style.less";
import { PullBlock, TreeNode } from "roamjs-components/types";
import { useEvent } from "./hooks";
import { formatDate, simulateClick } from "./helper";
import { ForbidEditRoamBlock } from "./forbird-edit-roam-block";


const delay = (ms?: number) => new Promise(resolve => {
  setTimeout(resolve, ms)
})
type TreeNode2 = Omit<TreeNode, 'children'> & { parents: { id: string }[], children: TreeNode2[], deep: string, refs?: { string?: string, uid: string, title?: string }[], time: number }
type TreeNode3 = Omit<TreeNode2, 'refs' | "chilren"> & { tags: { type: 'page' | 'block', text: string }[], string?: string }

type SideBarItem = {
  "collapsed?": boolean
  order: number
  "pinned?": boolean
  "window-id": string;
  dom: Element;
  title: string;
  uid: string;
  icon?: IconName,
} & (
    { type: 'custom', onClick: () => void }
    | { type: "search-query" }
    | { type: "graph", "page-uid": string }
    | { type: 'block', "block-uid": string }
    | { type: 'outline', "page-uid": string }
    | { type: "mentions", "mentions-uid": string }
  )

type ITEM = SideBarItem | TreeNode3;

const isSidebarItem = (item: ITEM): item is SideBarItem => {
  return 'dom' in item
}
let oldHref = ''
const api = {
  getAllChangesWithin2Day() {
    const now = new Date();  // 获取当前时间
    const oneDayAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000));  // 获取 24 小时前的时间
    const timestamp = Math.floor(oneDayAgo.getTime());

    console.time('within day')
    const r = (window.roamAlphaAPI.data.q(
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
        return b.time - a.time
      }).filter(item => item.string);
    console.timeEnd('within day')

    return r;
  },
  focusOnBlock(item: TreeNode3) {
    window.roamAlphaAPI.ui.setBlockFocusAndSelection({
      location: {
        "block-uid": item.uid,
        "window-id": 'main-window'
      }
    })
  },
  async checkIsUnderCurrentBlock(item: TreeNode3) {
    const openUid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
    const openId = window.roamAlphaAPI.q(`[:find ?e . :where [?e :block/uid "${openUid}"]]`) as unknown as string
    // console.log(item.parents.some(p => p.id === openId), ' is Under ', item, openUid)
    return item.parents.some(p => p.id === openId)
  },
  async openRightsidebar() {
    await window.roamAlphaAPI.ui.rightSidebar.open();
    await delay(10)
  },
  toggleSidebarWindow(sidebarItem: SideBarItem) {
    simulateClick(sidebarItem.dom.querySelector(".rm-caret"))
  },
  removeSidebarWindow(sidebarItem: SideBarItem) {
    simulateClick(sidebarItem.dom.querySelector(".bp3-icon-cross"))
  },
  getRightSidebarItems() {
    const parentEl = document.querySelector(".sidebar-content");
    if (!parentEl) {
      return []
    }
    return window.roamAlphaAPI.ui.rightSidebar.getWindows().map((sidebarItemWindow, index) => {
      let title = '';
      const icons: Record<'search-query' | 'graph' | 'block' | 'outline' | 'mentions', string> = {
        'search-query': 'panel-stats',
        graph: 'graph',
        "block": "symbol-circle",
        "mentions": "properties",
        "outline": 'application',
      };
      const dom = parentEl.children[index] as HTMLDivElement;
      // @ts-ignore
      if (sidebarItemWindow.type === 'search-query' || sidebarItemWindow.type === 'graph'
        || sidebarItemWindow.type === 'mentions'
      ) {
        // @ts-ignore
        title = dom.querySelector(".rm-sidebar-window").firstElementChild.children[1].innerText
      } else {
        if (sidebarItemWindow.type === 'block') {
          title = window.roamAlphaAPI.q(`[:find ?e . :where [?b :block/uid "${sidebarItemWindow["block-uid"]}"] [?b :block/string ?e]]`) as unknown as string

        } else {
          title = window.roamAlphaAPI.q(`[:find ?e . :where [?b :block/uid "${sidebarItemWindow["page-uid"]}"] [?b :node/title ?e]]`) as unknown as string
        }
      }
      return {
        ...sidebarItemWindow,
        uid: sidebarItemWindow["window-id"],
        dom,
        title,
        icon: icons[sidebarItemWindow.type]
      } as SideBarItem
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
        string: '',
        uid: newUid,
      },
      location: {
        "parent-uid": parentUid,
        order: order
      }
    })
    return { newUid, parentUid };
  },
  async selectingBlockByUid(uid: string, shiftKeyPressed: boolean, parentUid = uid) {
    if (shiftKeyPressed) {
      window.roamAlphaAPI.ui.rightSidebar
        .addWindow({
          window:
            { type: 'block', 'block-uid': uid }
        })
      return;
    }
    await window.roamAlphaAPI.ui.mainWindow.openBlock({
      block: {
        uid: parentUid
      }
    })
    await delay(250)
    // TOOD: just focus on it
    window.roamAlphaAPI.ui.setBlockFocusAndSelection({
      location: {
        "block-uid": uid,
        "window-id": 'main-window'
      }
    })
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
`)
  },
  async getFocusedBlockUid() {
    return await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid()
  },
  getCurrentPageFullTreeByUid(uid: string) {
    const sortByOrder = (node: TreeNode3) => {
      const _sortByOrder = (_node: TreeNode3) => {
        _node.children = _node.children ? _node.children.map(_sortByOrder).sort(orderSort) : []
        return _node;
      }

      const orderSort = (a: TreeNode3, b: TreeNode3) => {
        return a.order - b.order
      }
      if (node.children)
        node.children = node.children.map(_sortByOrder).sort(orderSort)
      return node;
    }
    console.time("CurrentPage")
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
    ]) . :where [?b :block/uid "${uid}"]]`) as unknown as TreeNode3
    console.timeEnd("CurrentPage")
    return sortByOrder(tree);
  },
  recordPageAndScrollPosition() {
    oldHref = location.href;

    console.log('record: ', oldHref)
  },
  restorePageAndScrollPosition() {
    console.log('restoring: ', oldHref)
    setTimeout(() => {
      location.replace(oldHref);
    }, 20)

  },
  async focusOnBlockWithoughtHistory(uid: string) {

    const hashes = location.hash.split("/")
    hashes.pop();
    hashes.push(uid);
    const newHash = hashes.join("/");
    var newUrl = location.origin + newHash;
    // console.log(newUrl, newHash, ' newUrl');
    await delay(10)
    // location.replace(newUrl);
    await delay(10)

    // window.roamAlphaAPI.ui.mainWindow.openBlock({
    //   block: {
    //     uid
    //   }
    // })

  },
}

function escapeRegExpChars(text: string) {
  return text.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}


function highlightText(text: string, query: string) {
  if (!text) {
    return text;
  }
  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(escapeRegExpChars);
  if (words.length === 0) {
    return [text];
  }
  const regexp = new RegExp(words.join("|"), "gi");
  const tokens: React.ReactNode[] = [];
  while (true) {
    const match = regexp.exec(text);
    if (!match) {
      break;
    }
    const length = match[0].length;
    const before = text.slice(lastIndex, regexp.lastIndex - length);
    if (before.length > 0) {
      tokens.push(before);
    }
    lastIndex = regexp.lastIndex;
    tokens.push(<strong key={lastIndex}>{match[0]}</strong>);
  }
  const rest = text.slice(lastIndex);
  if (rest.length > 0) {
    tokens.push(rest);
  }
  return tokens;
}

type PassProps = {
  itemPredicate?: (query: string, item: unknown) => boolean
  items: (v: any) => (TreeNode3 | SideBarItem)[],
  itemRenderer: ItemRenderer<unknown>
  onItemSelect?: (v: any) => void;
}


type RightMenuType = "top" | 'right' | 'bottom' | 'switch' | 'remove';
type OnRightMenuClick2 = (item: SideBarItem | TreeNode3, type: RightMenuType, e: React.MouseEvent<HTMLElement>) => void;

type OnRightMenuClick = (type: RightMenuType, e: React.MouseEvent<HTMLElement>) => void;

const RightMenu: FC<{
  onClick: OnRightMenuClick
}> = (props) => {
  return <div className="right-menu">
    <ButtonGroup>
      <Tooltip
        content={
          <span>Insert a block above</span>
        }>
        <Button icon="add-row-top" onClick={e => props.onClick('top', e)} />
      </Tooltip>

      <Tooltip
        content={
          <span>Insert a block below</span>
        }>
        <Button icon="add-row-bottom" onClick={e => props.onClick('bottom', e)} />
      </Tooltip>
      <Tooltip
        content={
          <span>Open in sidebar</span>
        }>
        <Button icon="arrow-right" onClick={e => props.onClick('right', e)} />
      </Tooltip>

    </ButtonGroup>
  </div>
}

const SidebarRightMenu: FC<{
  onClick: OnRightMenuClick
}> = (props) => {
  return <div className="right-menu">
    <ButtonGroup>
      <Tooltip
        content={
          <span>Toggle in sidebar</span>
        }>
        <Button icon="segmented-control" onClick={e => props.onClick('switch', e)} />
      </Tooltip>
      <Tooltip
        content={
          <span>Remove from sidebar</span>
        }>
        <Button icon="small-cross" onClick={e => props.onClick('remove', e)} />
      </Tooltip>

    </ButtonGroup>
  </div>
}


export default function Extension(props: { isOpen: boolean, onClose: () => void }) {

}

const toast = Toaster.create({

})
function BlockDiv(props: { uid: string, "zoom-path"?: boolean }) {
  const ref = useRef<HTMLDivElement>()
  useEffect(() => {
    window.roamAlphaAPI.ui.components.renderBlock({
      uid: props.uid,
      el: ref.current,
      // @ts-ignore
      "zoom-path?": props["zoom-path"]
    })
  }, [])
  return <div ref={ref} />
}

let lastedCloseTime: number

const isFetchAgainIn5Seconds = () => {
  if (!lastedCloseTime) {
    lastedCloseTime = Date.now()
  } else {
    if ((Date.now() - lastedCloseTime) < (1000 & 5)) {
      console.log(' not now')
      return true;
    }
  }
  return false;
}

let AppIsOpen = false;
function App(props: { extensionAPI: RoamExtensionAPI }) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>()
  const refs = useRef({
    query: '',
    isClosing: false
  });
  refs.current.query = query
  const getSidebarModeData = () => {
    console.time("Sidebar")
    const rightSidebarItems = api.getRightSidebarItems()
    const result = rightSidebarItems.concat([
      {
        dom: {},
        type: 'custom', title: 'Clear Sidebar', uid: 'clean-sidebar', icon: 'remove',
        onClick() {
          rightSidebarItems.forEach(item => {
            onRightMenuClick(item, 'remove', { preventDefault: () => { }, stopPropagation: () => { } } as React.MouseEvent<HTMLElement>)
          })
        }
      },
    ] as SideBarItem[])
    console.timeEnd('Sidebar')
    return result;
  }
  const initData = async () => {
    api.recordPageAndScrollPosition();

    console.log(Date.now() - lastedCloseTime < 10000, ' ---@=')

    if (isFetchAgainIn5Seconds()) {
      return;
    }

    const pageOrBlockUid = oldHref.split("/").pop()
    if (!oldHref.includes("/page/")) {
      toast.show({
        message: 'Switch+ only works in a specific page',
        intent: 'warning',
        icon: 'hand',
      }, 'switch+warning')
      return;
    }
    console.time("init")
    console.time('Source')

    const pageUid = (window.roamAlphaAPI.q(`[
        :find ?e .
        :where
          [?b :block/uid "${pageOrBlockUid}"]
          [?b :block/page ?p]
          [?p :block/uid ?e]
      ]`) as unknown as string) || pageOrBlockUid;

    // setTree(withParents(roamApi.getCurrentPageFullTreeByUid(pageUid) as TreeNode3, []));
    const flatted = flatTree(api.getCurrentPageFullTreeByUid(pageUid));
    console.timeEnd('Source')

    setSources({
      lineMode: flatted[1].filter(item => item.text),
      strMode: flatted[1].filter(item => item.text),
      tagMode: flatted[2].filter(item => item.text),
      sidebarMode: getSidebarModeData(),
      changedMode: api.getAllChangesWithin2Day()
    });

    console.timeEnd("init")

    // 默认
    // setPassProps(defaultFn(""));
  }

  const resetInputWithMode = async (nextMode: string) => {
    const value = (inputRef.current?.value) || "";
    const modeName = Object.keys(modes).find(mode => {
      return value.startsWith(mode)
    })
    let query = `${nextMode}${value}`;
    if (modeName) {
      query = nextMode + value.substring(modeName.length)
    }
    handleQueryChange(query);
    findActiveItem()
    await delay(100)
    inputRef.current.setSelectionRange(nextMode.length, query.length)

  }
  const openSidebar = async () => {
    await api.openRightsidebar();
    if (!AppIsOpen) {
      await initData()
    } else {
      setSources(prev => {
        return {
          ...prev,
          sidebarMode: getSidebarModeData()
        }
      })
      await delay(20)
    }

  }
  useEffect(() => {
    props.extensionAPI.settings.panel.create({
      tabTitle: 'Switch+',

    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+',
      "default-hotkey": ['super-shift-p'],
      async callback() {
        if (!AppIsOpen) {
          await initData()
        }
        open();
        resetInputWithMode("")
      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Tag Mode',
      // "default-hotkey": ['super-shift-o'],
      async callback() {
        if (!AppIsOpen) {
          await initData()
        }
        open();
        resetInputWithMode("@")

      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Line Mode',
      // "default-hotkey": ['super-shift-l'],
      async callback() {
        if (!AppIsOpen) {
          await initData()
        }
        open();
        resetInputWithMode(":")
      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Sidebar Mode',
      // "default-hotkey": ['super-shift-u'],
      async callback() {
        await openSidebar();
        open();
        resetInputWithMode("r:")
      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Latest Edit Mode',
      // "default-hotkey": ['super-shift-e'],
      async callback() {
        if (!AppIsOpen) {
          await initData()
        }
        open();
        resetInputWithMode("e:")
      },
    })
  }, []);


  const open = async () => {
    AppIsOpen = true;
    refs.current.isClosing = false;
    setOpen(true);
    setTimeout(() => {
      AppIsOpen = false;

    }, 120)

  }

  const [passProps, setPassProps] = useState<PassProps>({
    items: () => [],
    itemRenderer: () => <></>,
    onItemSelect: () => { },
  });
  const [sources, setSources] = useState<{
    'lineMode': TreeNode3[],
    'strMode': TreeNode3[],
    'tagMode': TreeNode3[],
    'sidebarMode': SideBarItem[],
    'changedMode': TreeNode3[]
  }>({} as any);

  const onRightMenuClick: OnRightMenuClick2 = async (item, type, e) => {
    e.preventDefault();
    e.stopPropagation();
    const handles = {
      right: () => {
        api.selectingBlockByUid(item.uid, true);

      },
      top: async () => {
        changeSelected(!e.shiftKey)
        const newUid = await api.insertBlockByUid(item.uid, item.order)
        api.selectingBlockByUid(newUid.newUid, e.shiftKey, newUid.parentUid)
        onDialogClose();

      },
      bottom: async () => {
        changeSelected(!e.shiftKey)
        const newUid = await api.insertBlockByUid(item.uid, item.order + 1)
        api.selectingBlockByUid(newUid.newUid, e.shiftKey, newUid.parentUid)
        onDialogClose();
      },
      switch: () => {
        api.toggleSidebarWindow(item as SideBarItem)
      },
      remove: () => {
        api.removeSidebarWindow(item as SideBarItem)
        console.log(item, ' removing ')
        setSources(prev => {
          return {
            ...prev,
            sidebarMode: prev.sidebarMode.filter(_m => {
              return _m.uid !== item.uid
            })
          }
        })
      }
    }
    await handles[type]();
  }
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
        return str ? item.text.toLowerCase().includes(str.toLowerCase()) : false;
      },
      itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
        // console.log(item, ' = render', itemProps)
        return <MenuItem
          style={{
            paddingLeft: (item.parents?.length || 0) * 15
          }}
          {...itemProps.modifiers}
          text={
            <div
              className={`switch-result-item ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}`}
            >
              <span className="rm-bullet__inner" />
              <div className="ellipsis">
                {
                  highlightText(item.text, str)
                }
              </div>

              <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
            </div>
          }
          onClick={(e) => {
            if (e.shiftKey) {
              api.selectingBlockByUid(item.uid, true)
              return;
            }
            setActiveItemByItem(item);
          }}
          onDoubleClick={e => {
            itemProps.handleClick(e)
          }}
        >
        </MenuItem>
      }
    };
  }
  const modes: Record<string, (str: string) => PassProps> = {
    ":": (str) => {
      // console.log(str, ' line mode', sources.lineMode)
      return {
        itemPredicate(query: string, item: TreeNode3) {
          return item.deep.startsWith(str) || item.deep.split(".").join("").startsWith(str);
        },
        items: (_sources: typeof sources) => _sources.lineMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item 
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `} >

                <div className="deep">
                  {highlightText(item.deep, str)}
                </div>
                <div className="ellipsis">
                  {item.text}
                </div>
                <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
              </div>
            }
            onClick={(e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true)
                return;
              }
              setActiveItemByItem(item);
            }}
            onDoubleClick={e => {
              itemProps.handleClick(e)
            }}
          >
          </MenuItem>
        }
      }
    },
    "@": (str) => {

      return {
        itemPredicate(query, item: TreeNode3) {
          return item.tags.some(ref => ref.text.toLowerCase().includes(str.toLowerCase()));
        },
        items: (_sources: typeof sources) => _sources.tagMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item tag-mode
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `} >
                {
                  item.tags?.map(ref => {
                    return <Tag
                      icon={ref.type === 'page' ? <span className="rm-icon-key-prompt">{`[[`}</span> : <span className="rm-icon-key-prompt">{`((`}</span>}
                      className="rm-page-ref--tag">{highlightText(ref.text, str)}</Tag>
                  })}
                <small className="ellipsis">
                  {item.text}
                </small>
                <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
              </div>
            }
            onClick={(e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true)
                return;
              }
              setActiveItemByItem(item);
            }}
            onDoubleClick={e => {
              itemProps.handleClick(e)
            }}
          >
          </MenuItem>
        }

      }
    },
    "s:": defaultFn,
    "r:": (str) => {
      return {
        items: (_sources: typeof sources) => _sources.sidebarMode,
        itemPredicate(query, item: SideBarItem) {
          return item.title.toLowerCase().includes(str.toLowerCase())
        },
        itemRenderer(item: SideBarItem, itemProps: IItemRendererProps) {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          let content = <>
            <Button icon={item.icon}
              active={false}
              fill minimal alignText="left" text={item.title}
              rightIcon={
                <SidebarRightMenu onClick={(type, e) => { onRightMenuClick(item, type, e) }} />
              }
            />
          </>
          if (item.type === 'custom') {
            content = <>
              <Button icon={item.icon} fill minimal alignText="left" text={item.title} />
            </>
          }
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}`} >
                {content}
              </div>
            }
            onClick={item.type === 'custom' ? itemProps.handleClick : (e) => {
              setActiveItem(item);
              focusSidebarWindow(item);
            }}>
          </MenuItem>
        }
      }
    },
    "e:": (str) => {
      return {
        items: (_sources: typeof sources) => _sources.changedMode,
        itemPredicate(query, item: TreeNode3) {
          return item.string.toLowerCase().includes(str.toLowerCase())
        },
        itemRenderer(item: TreeNode3, itemProps: IItemRendererProps) {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          let content = <>
            <Button
              active={false}
              fill minimal alignText="left" text={
                highlightText(item.string, str)
              }
              rightIcon={
                <div className="right-menu">
                  <Tooltip
                    content={
                      <span>Open in sidebar</span>
                    }>
                    <Button icon="arrow-right" onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      api.selectingBlockByUid(item.uid, true);
                    }} />
                  </Tooltip>
                </div>
              }
            />
          </>
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `}
                style={{ alignItems: 'end' }}
              >
                {content}
                <small style={{ minWidth: 110, opacity: 0.6, textAlign: 'end' }}>{formatDate(new Date(item.time))}</small>
              </div>
            }
            onClick={(e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true)
                return;
              }
              setActiveItemByItem(item);
            }}
            onDoubleClick={e => {
              itemProps.handleClick(e)
            }}
          >
          </MenuItem>
        }
      }
    }
  }
  function setActiveItemByItem(item: TreeNode3 | SideBarItem) {

    setActiveItem(item)
    madeActiveItemChange(item)
  }

  const itemsSource = passProps.items(sources)

  const findActiveItem = useEvent(async () => {
    const uid = oldHref.split("/").pop();
    const activeItem = itemsSource.find(item => item.uid === uid)
    console.log(uid, ' = uid item', activeItem)
    if (activeItem) {
      setActiveItem(activeItem)
      madeActiveItemChange(activeItem, true)
    }
  })

  const focusSidebarWindow = async (item: SideBarItem) => {
    if (refs.current.isClosing) {
      return;
    }
    setTimeout(() => {
      item.dom.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start'
      });
    }, 10)

    console.log('dom; ', item)
  }

  // const focusOnItem = async (item: TreeNode3) => {
  //   if (await api.checkIsUnderCurrentBlock(item)) {
  // api.focusOnBlock(item)
  //     return true;
  //   }
  // }
  const madeActiveItemChange = async (item: TreeNode3 | SideBarItem, immediately = false) => {
    await delay(10)
    console.log(item, ' --- delay')
    if (isSidebarItem(item)) {
      focusSidebarWindow(item)
      return
    }

    // if (await focusOnItem(item)) {
    // return
    // }
    scrollToActiveItem(item, immediately)
    await api.focusOnBlockWithoughtHistory(item.uid)
    inputRef.current.focus()
  }
  useEffect(() => {
    if (isOpen) {
    } else {
      setTimeout(() => {
        setQuery("")
        changeSelected(false)
      }, 20)
    }
  }, [isOpen])
  const selected = useRef(false)
  function changeSelected(next: boolean) {
    selected.current = next;
  }
  const handleClose = () => {
    refs.current.isClosing = true;
    setOpen(false)
    lastedCloseTime = Date.now()
  }
  const onDialogClose = () => {
    // api.clearHistory
    console.log('on close: 1', selected)
    if (!selected.current) {
      api.restorePageAndScrollPosition()
    }
    handleClose();
  }
  const [activeItem, setActiveItem] = useState<TreeNode3 | SideBarItem>();
  async function handleQueryChange(_query: string) {
    const tag = Object.keys(modes).find(mode => {
      if (_query.startsWith(mode)) {
        return true;
      }
      return false;
    });
    // console.log('handle query change: ', query, tag)
    if (tag === 'r:' && !query.startsWith('r:')) {
      await openSidebar()
    }
    const fn = modes[tag] || defaultFn;
    const str = modes[tag] ? _query.substring(tag.length) : _query;
    setPassProps(fn(str.trim()));
    setQuery(_query)
  }
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const filteredItems = useRef<(TreeNode3 | SideBarItem)[]>([]);
  let scrollToActiveItem = (item: { uid: string }, immediately: boolean) => { };
  // console.log(query, passProps, itemsSource)
  const isRightSidebarMode = query.startsWith("r:");
  return (
    <div>
      <Omnibar<TreeNode3 | SideBarItem>
        className={`${ID} ${isRightSidebarMode ? `${ID}-sidebar-mode` : ''}`}
        isOpen={isOpen}
        scrollToActiveItem
        activeItem={activeItem}
        inputProps={{
          inputRef: inputRef,
          placeholder: '',
          onBlur() {
            console.log(" blur")
          }
        }}
        onClose={(e) => {
          // console.log(e, e.type, ' ----@type')
          onDialogClose()
        }}
        onItemSelect={async (item: TreeNode3 | SideBarItem, e) => {
          if (isSidebarItem(item)) {
            if (item.type === 'custom') {
              item.onClick();
            }
            onDialogClose()
            return;
          }
          const shiftKeyPressed = (e as any).shiftKey;
          changeSelected(!shiftKeyPressed)
          onDialogClose();
          if (query.startsWith("e:")) {

          }
          // if (!await focusOnItem(item)) {
          api.selectingBlockByUid(item.uid, shiftKeyPressed);
          // }
        }}
        {...passProps}
        itemRenderer={(item, itemProps) => {

          return passProps.itemRenderer(item, {
            ...itemProps, handleClick: (e) => {
              if (e.shiftKey) {
                api.selectingBlockByUid(item.uid, true)
              } else {
                itemProps.handleClick(e)
              }
            }
          })
        }}
        items={itemsSource}
        onQueryChange={(query) => {
          handleQueryChange(query)
        }}
        onActiveItemChange={(_activeItem: TreeNode3 | SideBarItem) => {
          if (!_activeItem) {
            return;
          }

          // right side bar mode
          if ('dom' in _activeItem) {
            setActiveItem(_activeItem)
            focusSidebarWindow(_activeItem)
            return;
          }

          if (selected.current || refs.current.isClosing || AppIsOpen) {
            return
          }

          console.log(activeItem, ' --active change-- ', _activeItem, AppIsOpen);
          setActiveItemByItem(_activeItem)
        }}
        resetOnQuery
        resetOnSelect
        query={query}
        noResults={<MenuItem disabled={true} text="No results." />}
        itemListRenderer={(itemListProps) => {
          filteredItems.current = itemListProps.filteredItems;
          scrollToActiveItem = (node: { uid: string }, immediately = false) => {
            const index = filteredItems.current.findIndex(item => item.uid === node.uid)
            virtuosoRef.current.scrollIntoView({
              index,
              behavior: immediately ? 'auto' : 'smooth',
              align: 'center'
            });
            console.log(index, ' = index', itemListProps.activeItem, node, filteredItems.current)
          }

          return <div>
            <div className="flex">
              <Menu >
                <Virtuoso
                  ref={virtuosoRef}
                  style={{ height: '500px' }}
                  totalCount={itemListProps.filteredItems.length}
                  itemContent={index => {
                    return itemListProps.renderItem(itemListProps.filteredItems[index], index)
                  }} />
              </Menu>
              {isRightSidebarMode ? null : <Preview uid={activeItem?.uid} key={activeItem?.uid} />}
            </div>
            <Hints />
          </div>
        }}
        overlayProps={{
          portalClassName: isOpen ? 'open-portal' : 'close-portal'
        }}
      />
    </div >
  );
}
function Hints() {
  return <div className={`${ID}-hints`}>
    <span>
      <span className="hint-icon">@</span><span> refs mode </span>
    </span>
    <span >
      <span className="hint-icon">:</span><span> lines mode </span>
    </span>
    <span >
      <span className="hint-icon">r:</span><span> right sidebar mode </span>
    </span>
    <span >
      <span className="hint-icon">e:</span><span> changes in 48 hours  </span>
    </span>
  </div>
}

function Preview({ uid }: { uid: string }) {
  const ref = useRef<HTMLDivElement>();
  useEffect(() => {
    if (uid) {

      window.roamAlphaAPI.ui.components.renderBlock({
        uid,
        el: ref.current
      })
      return () => {

      }
    }

  }, [uid])
  return <div className={`${ID}-preview`}>
    <div ref={ref} />
  </div>
}

const ID = "rm-switches"
export function initExtension(extensionAPI: RoamExtensionAPI) {
  let roamEl = document.querySelector(".roam-app");
  let el = document.querySelector("#" + ID)
  if (el) {
    el.parentElement.removeChild(el);
  }
  el = document.createElement("div");
  el.id = ID;
  roamEl.appendChild(el);
  ReactDOM.render(<App extensionAPI={extensionAPI} />, el);
}


function flatTree(node: TreeNode3) {
  console.log(node, ' = node')
  const lineBlocks: TreeNode3[] = [];
  const blocks: TreeNode3[] = []
  const taggedBlocks: TreeNode3[] = []

  const flat = (_node: TreeNode2, deep: string, deepInt: number) => {
    // lineMode.set(deep, _node);
    _node.deep = deep;
    blocks.push(_node as unknown as TreeNode3);
    if (_node.refs) {
      const replacedString = replaceBlockReference(_node.text, _node.refs);
      _node.text = replacedString;
      taggedBlocks.push({
        ..._node,
        tags: _node.refs.map(ref => {

          return { text: (ref.title || ref.string) as unknown as string, type: 'block' }
        })
      })
    }
    _node.children?.forEach((childNode, index) => {
      flat(childNode, deep + '.' + (index + 1), deepInt + 1)
    })
  }


  node.children?.forEach((childNode, index) => {
    flat(childNode, (index + 1) + '', 0)
  })
  return [lineBlocks, blocks, taggedBlocks] as const;
}



export function replaceBlockReference(source: string, refs: { string?: string, title?: string, uid: string }[]) {
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
    const found = refs.find(r => r.uid === match[2]);
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


