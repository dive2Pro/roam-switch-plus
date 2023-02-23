import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from 'react-dom';
import { Button, ButtonGroup, Menu, MenuItem, Tag, Tooltip, } from "@blueprintjs/core";
import { IItemRendererProps, ItemRenderer, Omnibar, OmnibarProps } from "@blueprintjs/select";
import getFullTreeByParentUid from 'roamjs-components/queries/getFullTreeByParentUid';

import "./style.less";
import { RoamBlock, TreeNode } from "roamjs-components/types";


const delay = (ms?: number) => new Promise(resolve => {
  setTimeout(resolve, ms)
})
type TreeNode2 = Omit<TreeNode, 'children'> & { parents: string[], children: TreeNode2[], refs?: { id: number }[] }
type TreeNode3 = Omit<TreeNode2, 'refs'> & { refs: { type: 'page' | 'block', text: string }[] }

let oldHref = ''
const api = {
  async insertBlockByUid(uid: string, order: number) {
    const newUid = window.roamAlphaAPI.util.generateUID();
    const parentUid = window.roamAlphaAPI.q(`[
          :find [?e ...]
          :where
            [?b :block/uid "${uid}"]
            [?b :block/parents ?parents]
            [?parents :block/uid ?e]
        ]`) as unknown as string[];
    console.log(parentUid, newUid, order, uid)
    await window.roamAlphaAPI.createBlock({
      block: {
        string: '',
        uid: newUid,
      },
      location: {
        "parent-uid": parentUid.pop(),
        order: order
      }
    })
    return { newUid, parentUid };
  },
  async selectingBlockByUid(uid: string, shiftKeyPressed: boolean) {
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
        uid
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
  getCurrentPageFullTreeByUid(uid: string) {
    return window.roamAlphaAPI.q(`[:find (pull ?b [
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
    ]) . :where [?b :block/uid "${uid}"]]`) as unknown as TreeNode2
  },
  recordPageAndScrollPosition() {
    oldHref = location.href;
    console.log('record: ', oldHref)
  },
  restorePageAndScrollPosition() {
    // history.go(-1);
    // setTimeout(() => {
    //   window.roamAlphaAPI.ui.mainWindow
    //     .openBlock({
    //       block:
    //         { uid: oldHref.split("/").pop() }
    //     })
    // }, 5)
    console.log('restoring: ', oldHref)
    setTimeout(() => {
      location.replace(oldHref);
    }, 20)

  },
  async focusOnBlockWithoughtHistory(uid: string) {
    // history.go(-1);
    // setTimeout(() => {
    //   window.roamAlphaAPI.ui.mainWindow
    //     .openBlock({
    //       block:
    //         { uid: uid }
    //     })
    // }, 5)
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
  items: (v: any) => unknown[],
  itemRenderer: ItemRenderer<unknown>
  onItemSelect?: (v: any) => void;
}

type OnRightMenuClick = (type: "top" | 'right' | 'bottom', e: React.MouseEvent<HTMLElement>) => void;

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


export default function Extension(props: { isOpen: boolean, onClose: () => void }) {

}

function App(props: { extensionAPI: RoamExtensionAPI }) {
  const [isOpen, setOpen] = useState(false);

  const initData = async () => {
    api.recordPageAndScrollPosition();
    await onRouteChange();
  }
  useEffect(() => {
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+',
      "default-hotkey": ['super-shift-p'],
      async callback() {
        if (!isOpen)
          await initData()
        setOpen(prev => !prev)

      },
    })
    props.extensionAPI.ui.commandPalette.addCommand({
      label: 'Open Switch+ in Tag Mode',
      "default-hotkey": ['super-shift-o'],
      async callback() {
        if (!isOpen) {
          await initData()
        }
        setOpen(prev => !prev)
        setTimeout(() => {
          setQuery("@")
        }, 100)
      },
    })
  }, [])
  const [passProps, setPassProps] = useState<PassProps>({
    items: () => [],
    itemRenderer: () => <></>,
    onItemSelect: () => { },
  });
  const [sources, setSources] = useState<{
    'lineMode': Map<string, TreeNode>,
    'strMode': TreeNode[],
    'tagMode': TreeNode3[]
  }>();
  type OnRightMenuClick2 = (item: { uid: string, order: number }, type: "top" | 'right' | 'bottom', e: React.MouseEvent<HTMLElement>) => void;

  const onRightMenuClick: OnRightMenuClick2 = async (item, type, e) => {
    e.preventDefault();
    e.stopPropagation();

    const handles = {
      right: () => {
        api.selectingBlockByUid(item.uid, true);
      },
      top: async () => {
        const newUid = await api.insertBlockByUid(item.uid, item.order)
        api.selectingBlockByUid(newUid.newUid, e.shiftKey)
      },
      bottom: async () => {
        const newUid = await api.insertBlockByUid(item.uid, item.order + 1)
        api.selectingBlockByUid(newUid.newUid, e.shiftKey)
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
      itemRenderer: (item: TreeNode2, itemProps: IItemRendererProps) => {
        // console.log(item, ' = render', itemProps)
        return <MenuItem
          style={{
            paddingLeft: (item.parents?.length || 0) * 5
          }}
          {...itemProps.modifiers}
          text={
            <div
              className={`switch-result-item ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}`}
            >
              {
                highlightText(item.text, str)
              }
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
      return {
        itemPredicate(query, item) {
          return true;
        },
        items: () => [],
        itemRenderer(item) {
          return <></>
        }
      }
    },
    "@": (str) => {

      return {
        itemPredicate(query, item: TreeNode3) {
          return item.refs.some(ref => ref.text.toLowerCase().includes(str.toLowerCase()));
        },
        items: (_sources: typeof sources) => _sources.tagMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          // console.log(item, ' = render', itemProps)
          return <MenuItem
            {...itemProps.modifiers}
            text={
              <div
                className={`switch-result-item 
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `} >
                {
                  item.refs.map(ref => {
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
    // "#": (str) => { },
    "s:": defaultFn
  }
  const onRouteChange = async () => {
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
    // setTree(withParents(roamApi.getCurrentPageFullTreeByUid(pageUid) as TreeNode2, []));
    const flatted = flatTree(api.getCurrentPageFullTreeByUid(pageUid))
    console.log(flatted, ' -@', pageUid, pageOrBlockUid)

    setSources({
      lineMode: flatted[0],
      strMode: flatted[1],
      tagMode: flatted[2]
    });
    // 默认
    setPassProps(defaultFn(""));
  }
  // useEffect(() => {

  //   window.addEventListener('locationchange', onRouteChange);
  //   return (() => {
  //     window.removeEventListener('locationchange', onRouteChange);
  //   });
  // }, [])

  useEffect(() => {
    selected.current = false;
  }, [isOpen])
  const selected = useRef(false)
  const [query, setQuery] = useState("")
  const handleClose = () => {
    setOpen(false)
  }
  const onDialogClose = () => {
    // api.clearHistory
    console.log('on close: 1')
    if (!selected.current) {
      api.restorePageAndScrollPosition()
    }
    handleClose();
    setTimeout(() => {
      setQuery("")
    }, 20)
  }
  // console.log(selected.current, ' = selected ', oldHref)
  return (
    <div >
      <Omnibar
        className="rm-switchs"
        isOpen={isOpen}
        onClose={onDialogClose}
        onItemSelect={async (item: { uid: string }, e) => {
          const shiftKeyPressed = (e as any).shiftKey
          if (!shiftKeyPressed) {
            selected.current = true;
          } else {
            api.restorePageAndScrollPosition()
          }
          handleClose();
          api.selectingBlockByUid(item.uid, shiftKeyPressed);
        }}
        {...passProps}
        items={passProps.items(sources)}
        onQueryChange={(query) => {
          if (!isOpen) {
            return;
          }
          const usedMode = Object.keys(modes).find(mode => {
            if (query.startsWith(mode)) {
              return true;
            }
            return false;
          })
          const tag = usedMode;
          const fn = modes[tag] || defaultFn;
          const str = modes[tag] ? query.substring(tag.length) : query;
          setPassProps(fn(str.trim()));
          setQuery(query)
        }}
        onActiveItemChange={(activeItem: TreeNode) => {
          // console.log(activeItem, ' ---- ', props.isOpen);
          if (!activeItem || selected.current || !isOpen) {
            return
          }
          api.focusOnBlockWithoughtHistory(activeItem.uid)
        }}
        resetOnQuery
        resetOnSelect
        query={query}
        noResults={<MenuItem disabled={true} text="No results." />}
        itemListRenderer={(itemListProps) => {
          // @ts-ignore
          return <Menu {...itemListProps.menuProps}>
            {itemListProps.filteredItems.map((item, index) => {
              return itemListProps.renderItem(item, index)
            })}
          </Menu>
        }}
      />
    </div>
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


function flatTree(node: TreeNode2) {
  console.log(node, ' = node')
  const lineMode = new Map<string, TreeNode2>();
  const blocks: TreeNode2[] = []
  const taggedBlocks: TreeNode3[] = []

  const flat = (_node: TreeNode2, deep: string, deepInt: number) => {
    lineMode.set(deep, _node);
    blocks.push(_node);
    if (_node.refs) {
      const replacedString = replaceBlockReference(_node.text);
      _node.text = replacedString;
      taggedBlocks.push({
        ..._node,
        refs: _node.refs.map(ref => {
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
  return [lineMode, blocks, taggedBlocks] as const;
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