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

  const MAX_LENGTH = 200; // 最大显示长度
  const CONTEXT_RANGE = 30; // 匹配位置前后保留的字符数

  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map(escapeRegExpChars);
  if (words.length === 0) {
    return [text];
  }
  const regexp = new RegExp(words.join("|"), "gi");

  // 如果文本长度超过阈值，需要找到所有匹配位置并计算保留范围
  if (text.length > MAX_LENGTH) {
    const matches: Array<{ start: number; end: number }> = [];
    let match;
    // 重置 regexp 以便重新匹配
    regexp.lastIndex = 0;
    const MAX_MATCHES = 3; // 最多保留的匹配数量
    while (
      (match = regexp.exec(text)) !== null &&
      matches.length < MAX_MATCHES
    ) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    if (matches.length === 0) {
      // 没有匹配，直接截断
      return [text.slice(0, MAX_LENGTH) + "..."];
    }

    // 计算需要保留的范围
    const ranges: Array<{ start: number; end: number }> = [];
    for (const match of matches) {
      const start = Math.max(0, match.start - CONTEXT_RANGE);
      const end = Math.min(text.length, match.end + CONTEXT_RANGE);
      ranges.push({ start, end });
    }

    // 合并重叠的范围
    ranges.sort((a, b) => a.start - b.start);
    const mergedRanges: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      if (mergedRanges.length === 0) {
        mergedRanges.push(range);
      } else {
        const last = mergedRanges[mergedRanges.length - 1];
        if (range.start <= last.end) {
          last.end = Math.max(last.end, range.end);
        } else {
          mergedRanges.push(range);
        }
      }
    }

    // 构建最终的文本和 tokens
    const tokens: React.ReactNode[] = [];
    let processedIndex = 0;

    for (let i = 0; i < mergedRanges.length; i++) {
      const range = mergedRanges[i];

      // 添加省略号（如果前面有未处理的内容）
      if (range.start > processedIndex) {
        if (processedIndex === 0) {
          // 开头省略
          tokens.push("...");
        } else {
          // 中间省略
          tokens.push("...");
        }
      }

      // 处理当前范围内的文本，只高亮前 3 个匹配
      const rangeText = text.slice(range.start, range.end);
      let rangeLastIndex = 0;

      // 找到在当前范围内的匹配（只使用前 3 个）
      const rangeMatches = matches
        .filter((m) => m.start >= range.start && m.end <= range.end)
        .sort((a, b) => a.start - b.start);

      for (const match of rangeMatches) {
        const relativeStart = match.start - range.start;
        const relativeEnd = match.end - range.start;
        const before = rangeText.slice(rangeLastIndex, relativeStart);
        if (before.length > 0) {
          tokens.push(before);
        }
        const matchText = rangeText.slice(relativeStart, relativeEnd);
        tokens.push(<strong key={match.start}>{matchText}</strong>);
        rangeLastIndex = relativeEnd;
      }

      const rest = rangeText.slice(rangeLastIndex);
      if (rest.length > 0) {
        tokens.push(rest);
      }

      processedIndex = range.end;
    }

    // 如果最后还有未处理的内容，添加结尾省略号
    if (processedIndex < text.length) {
      tokens.push("...");
    }

    return tokens;
  }

  // 原始逻辑：文本长度未超过阈值，但也要限制匹配数量
  const tokens: React.ReactNode[] = [];
  const MAX_MATCHES = 3; // 最多保留的匹配数量
  let matchCount = 0;
  while (matchCount < MAX_MATCHES) {
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
    matchCount++;
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
      <div className="highlight-text">{highlightText(item.text, query)}</div>
      <RightMenu onClick={(type, e) => onRightMenuClick(item, type, e)} />
    </div>
  );
};
