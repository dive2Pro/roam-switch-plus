import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from 'react-dom';
import { Button, ButtonGroup, InputGroup, Menu, MenuItem, Tag, Tooltip } from "@blueprintjs/core";
import { IItemRendererProps, ItemRenderer, Omnibar } from "@blueprintjs/select";
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import "./style.less";
import { TreeNode } from "roamjs-components/types";
import { useEvent } from "./hooks";


const delay = (ms?: number) => new Promise(resolve => {
  setTimeout(resolve, ms)
})
type TreeNode2 = Omit<TreeNode, 'children'> & { parents: string[], children: TreeNode2[], deep: string, refs?: { id: number }[] }
type TreeNode3 = Omit<TreeNode2, 'refs'> & { tags: { type: 'page' | 'block', text: string }[] }

type SideBarItem = {
  "collapsed?": boolean
  order: number
  "pinned?": boolean
  "window-id": string;
  dom: Element;
  title: string;
  uid: string;
} & (
    { type: "search-query" }
    | { type: "graph", "page-uid": string }
    | { type: 'block', "block-uid": string }
    | { type: 'outline', "page-uid": string }
    | { type: "mentions", "mentions-uid": string }
  )

let oldHref = ''
const api = {
  toggleSidebarWindow(sidebarItem: SideBarItem) {
    window.roamAlphaAPI.ui.rightSidebar.collapseWindow({
      window: sidebarItem
    })
  },
  removeSidebarWindow(sidebarItem: SideBarItem) { },
  getRightSidebarItems() {
    const parentEl = document.querySelector(".sidebar-content");
    return window.roamAlphaAPI.ui.rightSidebar.getWindows().map((sidebarItemWindow, index) => {
      let title = '';
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

      node.children = node.children.map(_sortByOrder).sort(orderSort)
      return node;
    }
    const tree = window.roamAlphaAPI.q(`[:find (pull ?b [
      [:block/string :as "text"]
      :block/uid 
      :block/order 
      :block/heading 
      :block/refs
      :block/open 
      :block/parents
      [:children/view-type :as "viewType"] 
      [:block/text-align :as "textAlign"] 
      [:edit/time :as "editTime"] 
      :block/props 
      {:block/children ...}
    ]) . :where [?b :block/uid "${uid}"]]`) as unknown as TreeNode3


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
    // console.log(newUrl, ' newUrl');
    await delay(1)
    location.replace(newUrl);
  },
}

function escapeRegExpChars(text: string) {
  return text.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}


function highlightText(text: string, query: string) {
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
          <span>Toggle sidebar</span>
        }>
        <Button icon="segmented-control" onClick={e => props.onClick('switch', e)} />
      </Tooltip>
      <Tooltip
        content={
          <span>Open in sidebar</span>
        }>
        <Button icon="small-cross" onClick={e => props.onClick('remove', e)} />
      </Tooltip>

    </ButtonGroup>
  </div>
}


export default function Extension(props: { isOpen: boolean, onClose: () => void }) {

}

function App(props: { extensionAPI: RoamExtensionAPI }) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>()
  const refs = useRef({
    isOpen: false,
    query: '',
    isClosing: false
  });
  refs.current.isOpen = isOpen;
  refs.current.query = query

  const initData = async () => {
    api.recordPageAndScrollPosition();
    const pageOrBlockUid = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
    if (!pageOrBlockUid) {
      throw new Error("Not in a page")
    }

    const pageUid = (window.roamAlphaAPI.q(`[
        :find ?e .
        :where
          [?b :block/uid "${pageOrBlockUid}"]
          [?b :block/page ?p]
          [?p :block/uid ?e]
      ]`) as unknown as string) || pageOrBlockUid;
    // setTree(withParents(roamApi.getCurrentPageFullTreeByUid(pageUid) as TreeNode3, []));
    const flatted = flatTree(api.getCurrentPageFullTreeByUid(pageUid));

    setSources({
      lineMode: flatted[1].filter(item => item.text),
      strMode: flatted[1].filter(item => item.text),
      tagMode: flatted[2].filter(item => item.text),
      sidebarMode: api.getRightSidebarItems()
    });

    // 默认
    // setPassProps(defaultFn(""));
  }

  const resetInputWithMode = (nextMode: string) => {
    const value = inputRef.current.value;
    const modeName = Object.keys(modes).find(mode => {
      return value.startsWith(mode)
    })
    let query = `${nextMode}${value}`;
    if (modeName) {
      query = nextMode + value.substring(modeName.length)
    }
    handleQueryChange(query);
    inputRef.current.setSelectionRange(nextMode.length, query.length)
    findActiveItem()
  }
  useEffect(() => {
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+',
      "default-hotkey": ['super-shift-p'],
      async callback() {
        if (!refs.current.isOpen) {
          await initData()
        }
        open();
        resetInputWithMode("")
      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Tag Mode',
      "default-hotkey": ['super-shift-o'],
      async callback() {
        if (!refs.current.isOpen) {
          await initData()
        }
        open();
        resetInputWithMode("@")

      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Line Mode',
      "default-hotkey": ['super-shift-l'],
      async callback() {
        if (!refs.current.isOpen) {
          await initData()
        }
        open();
        resetInputWithMode(":")
      },
    })
  }, []);


  const open = async () => {
    refs.current.isOpen = true;
    refs.current.isClosing = false;
    setOpen(true);
    await delay(200);
    refs.current.isOpen = false;
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
    'sidebarMode': SideBarItem[]
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
      },
      bottom: async () => {
        changeSelected(!e.shiftKey)
        const newUid = await api.insertBlockByUid(item.uid, item.order + 1)
        api.selectingBlockByUid(newUid.newUid, e.shiftKey, newUid.parentUid)
      },
      switch: () => {
        api.toggleSidebarWindow(item as SideBarItem)
      },
      remove: () => {
        api.removeSidebarWindow(item as SideBarItem)
      }
    }
    await handles[type]();
    onDialogClose();
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
            paddingLeft: (item.parents?.length || 0) * 10
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
          onClick={itemProps.handleClick}>
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
            onClick={itemProps.handleClick}>
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
                      icon={ref.type === 'page' ? 'git-new-branch' : 'new-link'}
                      className="rm-page-ref--tag">{highlightText(ref.text, str)}</Tag>
                  })}
                <small className="ellipsis">
                  {item.text}
                </small>
                <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
              </div>
            }
            onClick={itemProps.handleClick}>
          </MenuItem>
        }

      }
    },
    "s:": defaultFn,
    ">": (str) => {
      return {
        items: (_sources: typeof sources) => _sources.sidebarMode,
        itemPredicate(query, item: SideBarItem) {
          return item.title.toLowerCase().includes(str.toLowerCase())
        },
        itemRenderer(item: SideBarItem, itemProps: IItemRendererProps) {
          // console.log(item, ' = render', itemProps, query, sources.tagMode)
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `} >
                {item.title}
              </div>
            }
            onClick={itemProps.handleClick}>
          </MenuItem>
        }
      }
    }
  }

  const itemsSource = passProps.items(sources)

  const findActiveItem = useEvent(async () => {
    const uid = oldHref.split("/").pop();
    const activeItem = itemsSource.find(item => item.uid === uid)
    console.log(uid, ' = uid item', activeItem)
    if (activeItem)
      madeActiveItemChange(activeItem, true)
  })

  const focusSidebarWindow = async (item: SideBarItem) => {
    if (refs.current.isClosing) {
      return;
    }
    setTimeout(() => {
      item.dom.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 10)

    console.log('dom; ', item)
  }

  const madeActiveItemChange = async (item: TreeNode3 | SideBarItem, immediately = false) => {
    await delay(100)
    console.log(item, ' --- delay')
    if ('dom' in item) {
      focusSidebarWindow(item)
      return
    }
    scrollToActiveItem(item, immediately)
    api.focusOnBlockWithoughtHistory(item.uid)
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
  function handleQueryChange(query: string) {
    const tag = Object.keys(modes).find(mode => {
      if (query.startsWith(mode)) {
        return true;
      }
      return false;
    });
    // console.log('handle query change: ', query)
    const fn = modes[tag] || defaultFn;
    const str = modes[tag] ? query.substring(tag.length) : query;
    setPassProps(fn(str.trim()));
    setQuery(query)
  }
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const filteredItems = useRef<(TreeNode3 | SideBarItem)[]>([]);
  let scrollToActiveItem = (item: { uid: string }, immediately: boolean) => { };
  // console.log(query, passProps, itemsSource)
  return (
    <div>
      <Omnibar<TreeNode3 | SideBarItem>
        className="rm-switchs"
        isOpen={isOpen}
        scrollToActiveItem
        activeItem={activeItem}
        inputProps={{
          inputRef: inputRef
        }}
        onClose={onDialogClose}
        onItemSelect={async (item: { uid: string }, e) => {
          const shiftKeyPressed = (e as any).shiftKey;
          changeSelected(!shiftKeyPressed)
          onDialogClose();
          api.selectingBlockByUid(item.uid, shiftKeyPressed);
        }}
        {...passProps}
        items={itemsSource}
        onQueryChange={(query) => {
          handleQueryChange(query)
        }}
        onActiveItemChange={(_activeItem: TreeNode3 | SideBarItem) => {
          if (!_activeItem) {
            return;
          }
          if ('dom' in _activeItem) {
            setActiveItem(_activeItem)
            focusSidebarWindow(_activeItem)
            return;
          }
          if (selected.current || refs.current.isOpen) {
            return
          }
          console.log(activeItem, ' --active change-- ', _activeItem);
          setActiveItem(_activeItem)
          madeActiveItemChange(_activeItem)
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

          return <Menu><Virtuoso
            ref={virtuosoRef}
            style={{ height: '400px' }}
            totalCount={itemListProps.filteredItems.length}
            itemContent={index => {
              return itemListProps.renderItem(itemListProps.filteredItems[index], index)
            }} />
          </Menu>
        }}
      />
    </div >
  );
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
      const replacedString = replaceBlockReference(_node.text);
      _node.text = replacedString;

      taggedBlocks.push({
        ..._node,
        tags: _node.refs.map(ref => {
          const pageStr = window.roamAlphaAPI.q(`
        [
          :find ?t .
          :in $ ?ref
          :where
            [?ref :node/title ?t]
        ]
        `, ref.id) as unknown as string;
          if (pageStr) {
            return {
              text: pageStr,
              type: 'page'
            }
          }
          const refStr =
            window.roamAlphaAPI.q(`
        [
          :find ?t .
          :in $ ?ref
          :where
            [?ref :block/string ?t]
        ]
        `, ref.id);
          return { text: refStr as unknown as string, type: 'block' }
        })
      })
    }
    _node.children?.forEach((childNode, index) => {
      flat(childNode, deep + '.' + (index + 1), deepInt + 1)
    })
  }

  node.children.forEach((childNode, index) => {
    flat(childNode, (index + 1) + '', 0)
  })
  return [lineBlocks, blocks, taggedBlocks] as const;
}



export function replaceBlockReference(source: string) {
  const refReg = /(\(\((.{9,})\)\))/gi;
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
    result += getRefStringByUid(match[2]);
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