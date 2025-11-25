import React, { FC, useEffect, useRef } from "react";
import { IItemRendererProps } from "@blueprintjs/select";
import { Button, ButtonGroup, Tooltip } from "@blueprintjs/core";
import type { TreeNode3, RightMenuType, OnRightMenuClick2 } from "../extension";

function escapeRegExpChars(text: string) {
  return text.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

export function highlightText(text: string, query: string) {
  if (!text) {
    return text;
  }
  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
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

const HighlightPagePrefix = "__H:__";
export function highlightText2(text: string, query: string): string {
  if (!text) {
    return text;
  }
  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map(escapeRegExpChars);
  if (words.length === 0) {
    return text;
  }
  const regexp = new RegExp(words.join("|"), "gi");
  const tokens: string[] = [];
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
    tokens.push(`[[[[${HighlightPagePrefix}]]${match[0]}]] `);
  }
  const rest = text.slice(lastIndex);
  if (rest.length > 0) {
    tokens.push(rest);
  }
  return tokens.join("");
}

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

interface SwitchResultItemProps {
  item: TreeNode3;
  itemProps: IItemRendererProps;
  query: string;
  onRightMenuClick: OnRightMenuClick2;
}

export const SwitchResultItem: FC<SwitchResultItemProps> = ({
  item,
  itemProps,
  query,
  onRightMenuClick,
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (divRef.current) {
      const div = divRef.current;

      const highlightedText = highlightText2(item.text, query);
      // @ts-ignore
      window.roamAlphaAPI.ui.components.renderString({
        string: highlightedText,
        el: div,
      });
    }
  }, [query]);
  return (
    <div
      className={`switch-result-item ${
        itemProps.modifiers.active ? "switch-result-item-active" : ""
      }`}
    >
      <span className="rm-bullet__inner" />
      <div>{highlightText(item.text, query)}</div>
      <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
    </div>
  );
};
