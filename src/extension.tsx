import React, { useEffect, useMemo, useRef, useState } from "react";
import { MenuItem, Tag, } from "@blueprintjs/core";
import { IItemRendererProps, ItemRenderer, Omnibar, OmnibarProps } from "@blueprintjs/select";
import getFullTreeByParentUid from 'roamjs-components/queries/getFullTreeByParentUid';

import "./style.less";
import { RoamBlock, TreeNode } from "roamjs-components/types";


type TreeNode2 = Omit<TreeNode, 'children'> & { parents: string[], children: TreeNode2[], refs?: { id: number }[] }
type TreeNode3 = Omit<TreeNode2, 'refs'> & { refs: string[] }

let oldHref = ''
let startTime = Date.now();
const api = {
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
      [:children/view-type :as "viewType"] 
      [:block/text-align :as "textAlign"] 
      [:edit/time :as "editTime"] 
      :block/props 
      {:block/children ...}
    ]) . :where [?b :block/uid "${uid}"]]`) as unknown as TreeNode2
  },
  recordPageAndScrollPosition() {
    oldHref = location.href;
  },
  restorePageAndScrollPosition() {
    history.go(-1);
    setTimeout(() => {
      window.roamAlphaAPI.ui.mainWindow
        .openBlock({
          block:
            { uid: oldHref.split("/").pop() }
        })
    }, 5)

  },
  focusOnBlockWithoughtHistory(uid: string) {
    history.go(-1);
    setTimeout(() => {
      window.roamAlphaAPI.ui.mainWindow
        .openBlock({
          block:
            { uid: uid }
        })
    }, 5)
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
}



export default function Extension(props: { isOpen: boolean, onClose: () => void }) {
  const [tree, setTree] = useState<TreeNode2>();
  const [items, setItems] = useState([]);
  const [passProps, setPassProps] = useState<PassProps>({
    items: () => [],
    itemRenderer: () => <></>,
  });
  const [sources, setSources] = useState<{
    'lineMode': Map<string, TreeNode>,
    'strMode': TreeNode[],
    'tagMode': TreeNode3[]
  }>();

  // 记录当前网址和滑动的距离
  // 
  const defaultFn = (str: string) => {
    // 查询的是字符串
    return {
      items: (_sources: typeof sources) => _sources.strMode,
      itemPredicate: (query: string, item: TreeNode) => {
        // console.log(item, ' ---- ', str ? 1 : 2, query)
        return str ? item.text.toLowerCase().includes(str.toLowerCase()) : false;
      },
      itemRenderer: (item: TreeNode, itemProps: IItemRendererProps) => {
        // console.log(item, ' = render', itemProps)
        return <MenuItem className={`switch-result-item 
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `
        }
          {...itemProps.modifiers}
          text={
            highlightText(item.text, str)
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
        },
      }
    },
    "@": (str) => {

      return {
        itemPredicate(query, item: TreeNode3) {
          return item.refs.some(ref => ref.toLowerCase().includes(str.toLowerCase()));
        },
        items: (_sources: typeof sources) => _sources.tagMode,
        itemRenderer: (item: TreeNode3, itemProps: IItemRendererProps) => {
          // console.log(item, ' = render', itemProps)
          return <MenuItem className={`switch-result-item 
                               ${itemProps.modifiers.active ? 'switch-result-item-active' : ''}
                               `
          }
            {...itemProps.modifiers}
            text={
              <div>
                {
                  item.refs.map(ref => {
                    return <span className="rm-page-ref--tag">{highlightText(ref, str)}</span> 
                  })}
                <small>
                  {item.text}
                </small>
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
      return;
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
    if (props.isOpen) {
      api.recordPageAndScrollPosition();
      onRouteChange();
    }
    selected.current = false;
  }, [props.isOpen])
  const selected = useRef(false)
  return (
    <div className="rm-switchs">
      <Omnibar
        {...props}
        onClose={() => {
          // api.clearHistory
          if (!selected.current) {
            api.restorePageAndScrollPosition()
          }
          props.onClose();
        }}
        onItemSelect={() => {
          selected.current = true;
          props.onClose();
        }}
        {...passProps}
        items={passProps.items(sources)}
        onQueryChange={(query) => {
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
        }}
        onActiveItemChange={(activeItem: TreeNode) => {
          // console.log(activeItem, ' ---- ', props.isOpen);
          if (!activeItem || selected.current) {
            return
          }
          api.focusOnBlockWithoughtHistory(activeItem.uid)
        }}
        resetOnQuery
        resetOnSelect
        noResults={<MenuItem disabled={true} text="No results." />}
      />
    </div>
  );
}

export function initExtension() {
  console.log("init extension");
}


function withParents(node: TreeNode2, parentIds: string[]) {
  node.parents = parentIds;
  node.children = node.children.map(child => {
    return withParents(child as TreeNode2, [...parentIds, node.uid])
  })
  return node;
}


function flatTree(node: TreeNode2) {
  console.log(node, ' = node')
  const lineMode = new Map<string, TreeNode2>();
  const blocks: TreeNode2[] = []
  const taggedBlocks: TreeNode3[] = []

  const flat = (_node: TreeNode2, deep: string) => {
    lineMode.set(deep, _node);
    blocks.push(_node);
    if (_node.refs) {
      const replacedString = replaceBlockReference(_node.text);
      _node.text = replacedString;
      taggedBlocks.push({
        ..._node,
        refs: _node.refs.map(ref => {
          const refStr = window.roamAlphaAPI.q(`
        [
          :find ?t .
          :in $ ?ref
          :where
            [?ref :node/title ?t]
        ]
        `, ref.id)
            ||
            window.roamAlphaAPI.q(`
        [
          :find ?t .
          :in $ ?ref
          :where
            [?ref :block/string ?t]
        ]
        `, ref.id);
          console.log(ref.id, ' -- ', refStr)

          return refStr as unknown as string;
        })
      })
    }
    _node.children?.forEach((childNode, index) => {
      flat(childNode, deep + '.' + (index + 1))
    })
  }

  node.children.forEach((childNode, index) => {
    flat(childNode, (index + 1) + '')
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