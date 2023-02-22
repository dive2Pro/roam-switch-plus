import React, { useEffect, useMemo, useRef, useState } from "react";
import { MenuItem, } from "@blueprintjs/core";
import { Omnibar, OmnibarProps } from "@blueprintjs/select";
import getFullTreeByParentUid from 'roamjs-components/queries/getFullTreeByParentUid';

import "./style.less";
import { TreeNode } from "roamjs-components/types";


type TreeNode2 = Omit<TreeNode, 'children'> & { parents: string[], children: TreeNode2[] }

const roamApi = {
  getCurrentPageFullTreeByUid(uid: string) {
    return (
      getFullTreeByParentUid(uid))
  }
}

type PassProps = {
  itemPredicate?: (query: string, item: unknown) => boolean
  items: unknown[],
  itemRenderer: (item: unknown) => JSX.Element
}
export default function Extension(props: { isOpen: boolean, onClose: () => void }) {
  const [tree, setTree] = useState<TreeNode2>();
  const [items, setItems] = useState([]);
  const [passProps, setPassProps] = useState<PassProps>({
    items: [],
    itemRenderer: () => <></>,
  });
  const [sources, setSources] = useState<{
    'lineMode': Map<string, TreeNode>,
    'strMode': TreeNode[]
  }>();

  // 记录当前网址和滑动的距离
  // 
  const defaultFn = (str: string) => {
    // 查询的是字符串
    return {
      items: sources.strMode,
      itemPredicate: (query: string, item: TreeNode) => {
        console.log(item, ' ---- ')
        return str ? item.text.toLowerCase().includes(str.toLowerCase()) : true;
      },
      itemRenderer: (item: TreeNode) => {
        return <div>{item.text}</div>
      }
    };
  }
  const modes: Record<string, (str: string) => PassProps> = {
    ":": (str) => {
      return {
        itemPredicate(query, item) {
          return true;
        },
        items: [],
        itemRenderer(item) {
          return <></>
        },
      }
    },
    // "@": (str) => {
    //   // 切换
    // },
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
          [?b :block/page ?e]
      ]`) as unknown as string) || pageOrBlockUid;
    // setTree(withParents(roamApi.getCurrentPageFullTreeByUid(pageUid) as TreeNode2, []));
    const flatted = flatTree(roamApi.getCurrentPageFullTreeByUid(pageUid))
    setSources({
      lineMode: flatted[0],
      strMode: flatted[1]
    })
  }
  useEffect(() => {

    window.addEventListener('locationchange', onRouteChange);
    return (() => {
      window.removeEventListener('locationchange', onRouteChange);
    });
  }, [])
  useEffect(() => {
    if (props.isOpen) {
      onRouteChange();
    }
  }, [props.isOpen])
  return (
    <div className="extension-template">
      <Omnibar
        {...props}
        onItemSelect={() => { }}
        {...passProps}
        onQueryChange={(query) => {
          const tag = query.substring(0, 1);
          const fn = modes[tag] || defaultFn;
          const str = modes[tag] ? query.substring(1) : query;
          setPassProps(fn(str));
        }}
        onActiveItemChange={(activeItem) => { }}
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


function flatTree(node: TreeNode) {
  const lineMode = new Map<string, TreeNode>();
  const blocks: TreeNode[] = []

  const flat = (_node: TreeNode, deep: string) => {
    lineMode.set(deep, _node);
    blocks.push(_node);
    _node.children.forEach((childNode, index) => {
      flat(childNode, deep + '.' + (index + 1))
    })
  }

  node.children.forEach((childNode, index) => {
    flat(childNode, (index + 1) + '')
  })
  return [lineMode, blocks] as const;
}