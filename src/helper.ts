let uninstalls: Function[] = [];

export const extension_helper = {
  on_uninstall: (cb: Function) => {
    uninstalls.push(cb);
  },
  uninstall() {
    uninstalls.forEach((fn) => {
      fn();
    });
    uninstalls = [];
  },
};

export const appendToTopbar = (name: string) => {
  //Add button (thanks Tyler Wince!)
  var nameToUse = name; //Change to whatever

  var checkForButton = document.getElementById(nameToUse + "-icon");
  if (!checkForButton) {
    checkForButton = document.createElement("span");
    var roamTopbar = document.getElementsByClassName("rm-topbar");
    var nextIconButton = roamTopbar[0].lastElementChild;
    var flexDiv = document.createElement("div");
    flexDiv.className = "rm-topbar__spacer-sm";
    nextIconButton.insertAdjacentElement("afterend", checkForButton);
  }
  return checkForButton;
};


export const simulateClick = (clickEl: Element) => {
  "mouseover mousedown mouseup click".split(" ").forEach((type) => {
    clickEl.dispatchEvent(
      new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1
      })
    );
  });
}


export function formatDate(date: Date) {
  // 获取今天的日期，并将其转换为毫秒数
  const today = new Date();
  const todayInMillis = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  // 获取要格式化的日期的毫秒数
  const dateInMillis = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  // 计算日期差异，以确定要格式化的日期是今天还是昨天
  const diffInMillis = todayInMillis - dateInMillis;
  const diffInDays = Math.floor(diffInMillis / (1000 * 60 * 60 * 24));

  // 根据日期差异返回格式化后的字符串
  if (diffInDays === 0) {
    // 如果日期差异为0，则返回“今天”的格式化字符串
    return `Today ${date.getHours()}:${pad(date.getMinutes())}`;
  } else if (diffInDays === 1) {
    // 如果日期差异为1，则返回“昨天”的格式化字符串
    return `Yesterday ${date.getHours()}:${pad(date.getMinutes())}`;
  } else {
    // 如果日期差异大于1，则返回原始日期的格式化字符串
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${date.getHours()}:${pad(date.getMinutes())}`;
  }
}

function pad(number: number) {
  // 辅助函数，将数字转换为两位数的字符串
  return number.toString().padStart(2, '0');
}
