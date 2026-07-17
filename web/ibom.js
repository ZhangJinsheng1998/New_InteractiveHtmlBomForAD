/* DOM manipulation and misc code */

var bomsplit;
var canvassplit;
var initDone = false;
var bomSortFunction = null;
var currentSortColumn = null;
var currentSortOrder = null;
var currentHighlightedRowId;
var lockedRowId = null;
var highlightHandlers = [];
var footprintIndexToHandler = {};
var netsToHandler = {};
var highlightedFootprints = [];
var highlightedNet = null;
var lastClicked;
// 多个元器件盒：每个盒子 {name, rows, cols, cells: {"row-col" -> [值, 封装]}}，全局共用
var binBoxes = [];
var binCurrentBox = 0;
var binAssignments = {}; // 当前盒子 cells 的别名，切盒子时重新指向

function dbg(html) {
  dbgdiv.innerHTML = html;
}

function redrawIfInitDone() {
  if (initDone) {
    redrawCanvas(allcanvas.front);
    redrawCanvas(allcanvas.back);
  }
}

function padsVisible(value) {
  writeStorage("padsVisible", value);
  settings.renderPads = value;
  redrawIfInitDone();
}

function referencesVisible(value) {
  writeStorage("referencesVisible", value);
  settings.renderReferences = value;
  redrawIfInitDone();
}

function valuesVisible(value) {
  writeStorage("valuesVisible", value);
  settings.renderValues = value;
  redrawIfInitDone();
}

function tracksVisible(value) {
  writeStorage("tracksVisible", value);
  settings.renderTracks = value;
  redrawIfInitDone();
}

function zonesVisible(value) {
  writeStorage("zonesVisible", value);
  settings.renderZones = value;
  redrawIfInitDone();
}

function dnpOutline(value) {
  writeStorage("dnpOutline", value);
  settings.renderDnpOutline = value;
  redrawIfInitDone();
}

function setDarkMode(value) {
  if (value) {
    topmostdiv.classList.add("dark");
  } else {
    topmostdiv.classList.remove("dark");
  }
  writeStorage("darkmode", value);
  settings.darkMode = value;
  redrawIfInitDone();
}

function setFullscreen(value) {
  if (value) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function fabricationVisible(value) {
  writeStorage("fabricationVisible", value);
  settings.renderFabrication = value;
  redrawIfInitDone();
}

function silkscreenVisible(value) {
  writeStorage("silkscreenVisible", value);
  settings.renderSilkscreen = value;
  redrawIfInitDone();
}

function setHighlightPin1(value) {
  writeStorage("highlightpin1", value);
  settings.highlightpin1 = value;
  redrawIfInitDone();
}

function getStoredCheckboxRefs(checkbox) {
  function convert(ref) {
    var intref = parseInt(ref);
    if (isNaN(intref)) {
      for (var i = 0; i < pcbdata.footprints.length; i++) {
        if (pcbdata.footprints[i].ref == ref) {
          return i;
        }
      }
      return -1;
    } else {
      return intref;
    }
  }
  if (!(checkbox in settings.checkboxStoredRefs)) {
    var val = readStorage("checkbox_" + checkbox);
    settings.checkboxStoredRefs[checkbox] = val ? val : "";
  }
  if (!settings.checkboxStoredRefs[checkbox]) {
    return new Set();
  } else {
    return new Set(settings.checkboxStoredRefs[checkbox].split(",").map(r => convert(r)).filter(a => a >= 0));
  }
}

function getCheckboxState(checkbox, references) {
  var storedRefsSet = getStoredCheckboxRefs(checkbox);
  var currentRefsSet = new Set(references.map(r => r[1]));
  // Get difference of current - stored
  var difference = new Set(currentRefsSet);
  for (ref of storedRefsSet) {
    difference.delete(ref);
  }
  if (difference.size == 0) {
    // All the current refs are stored
    return "checked";
  } else if (difference.size == currentRefsSet.size) {
    // None of the current refs are stored
    return "unchecked";
  } else {
    // Some of the refs are stored
    return "indeterminate";
  }
}

function setBomCheckboxState(checkbox, element, references) {
  var state = getCheckboxState(checkbox, references);
  element.checked = (state == "checked");
  element.indeterminate = (state == "indeterminate");
}

function createCheckboxChangeHandler(checkbox, references, row) {
  return function() {
    refsSet = getStoredCheckboxRefs(checkbox);
    var darkenWhenChecked = settings.darkenWhenChecked == checkbox;
    eventArgs = {
      checkbox: checkbox,
      refs: references,
    }
    if (this.checked) {
      // checkbox ticked
      for (var ref of references) {
        refsSet.add(ref[1]);
      }
      if (darkenWhenChecked) {
        row.classList.add("checked");
      }
      eventArgs.state = 'checked';
    } else {
      // checkbox unticked
      for (var ref of references) {
        refsSet.delete(ref[1]);
      }
      if (darkenWhenChecked) {
        row.classList.remove("checked");
      }
      eventArgs.state = 'unchecked';
    }
    settings.checkboxStoredRefs[checkbox] = [...refsSet].join(",");
    writeStorage("checkbox_" + checkbox, settings.checkboxStoredRefs[checkbox]);
    updateCheckboxStats(checkbox);
    EventHandler.emitEvent(IBOM_EVENT_TYPES.CHECKBOX_CHANGE_EVENT, eventArgs);
  }
}

function setRowLock(rowid) {
  if (lockedRowId && lockedRowId != rowid) {
    var oldRow = document.getElementById(lockedRowId);
    if (oldRow) oldRow.classList.remove("locked");
  }
  lockedRowId = rowid;
  if (rowid) {
    var row = document.getElementById(rowid);
    if (row) row.classList.add("locked");
  }
  updateBinHighlight();
}

function clearHighlightedFootprints() {
  setRowLock(null);
  if (currentHighlightedRowId) {
    var row = document.getElementById(currentHighlightedRowId);
    if (row) row.classList.remove("highlighted");
    currentHighlightedRowId = null;
    highlightedFootprints = [];
    highlightedNet = null;
  }
}

// 点击空白处解除锁定并清掉 PCB 上的高亮
function clearHighlightAndUnlock() {
  if (lockedRowId === null && !currentHighlightedRowId) return;
  clearHighlightedFootprints();
  drawHighlights();
}

function createRowHighlightHandler(rowid, refs, net) {
  return function() {
    if (currentHighlightedRowId) {
      if (currentHighlightedRowId == rowid) {
        return;
      }
      document.getElementById(currentHighlightedRowId).classList.remove("highlighted");
    }
    document.getElementById(rowid).classList.add("highlighted");
    currentHighlightedRowId = rowid;
    highlightedFootprints = refs ? refs.map(r => r[1]) : [];
    highlightedNet = net;
    drawHighlights();
    EventHandler.emitEvent(
      IBOM_EVENT_TYPES.HIGHLIGHT_EVENT,
      {
        rowid: rowid,
        refs: refs,
        net: net
      });
  }
}

function entryMatches(entry) {
  if (settings.bommode == "netlist") {
    // entry is just a net name
    return entry.toLowerCase().indexOf(filter) >= 0;
  }
  // check refs
  for (var ref of entry[3]) {
    if (ref[0].toLowerCase().indexOf(filter) >= 0) {
      return true;
    }
  }
  // check extra fields
  for (var i in config.extra_fields) {
    if (entry[4][i].toLowerCase().indexOf(filter) >= 0) {
      return true;
    }
  }
  // check value
  if (entry[1].toLowerCase().indexOf(filter) >= 0) {
    return true;
  }
  // check footprint
  if (entry[2].toLowerCase().indexOf(filter) >= 0) {
    return true;
  }
  return false;
}

function findRefInEntry(entry) {
  return entry[3].filter(r => r[0].toLowerCase() == reflookup);
}

function highlightFilter(s) {
  if (!filter) {
    return s;
  }
  var parts = s.toLowerCase().split(filter);
  if (parts.length == 1) {
    return s;
  }
  var r = "";
  var pos = 0;
  for (var i in parts) {
    if (i > 0) {
      r += '<mark class="highlight">' +
        s.substring(pos, pos + filter.length) +
        '</mark>';
      pos += filter.length;
    }
    r += s.substring(pos, pos + parts[i].length);
    pos += parts[i].length;
  }
  return r;
}

function checkboxSetUnsetAllHandler(checkboxname) {
  return function() {
    var checkboxnum = 0;
    while (checkboxnum < settings.checkboxes.length &&
      settings.checkboxes[checkboxnum].toLowerCase() != checkboxname.toLowerCase()) {
      checkboxnum++;
    }
    if (checkboxnum >= settings.checkboxes.length) {
      return;
    }
    var allset = true;
    var checkbox;
    var row;
    for (row of bombody.childNodes) {
      checkbox = row.childNodes[checkboxnum + 1].childNodes[0];
      if (!checkbox.checked || checkbox.indeterminate) {
        allset = false;
        break;
      }
    }
    for (row of bombody.childNodes) {
      checkbox = row.childNodes[checkboxnum + 1].childNodes[0];
      checkbox.checked = !allset;
      checkbox.indeterminate = false;
      checkbox.onchange();
    }
  }
}

function createColumnHeader(name, cls, comparator) {
  var th = document.createElement("TH");
  th.innerHTML = name;
  th.classList.add(cls);
  th.style.cursor = "pointer";
  var span = document.createElement("SPAN");
  span.classList.add("sortmark");
  span.classList.add("none");
  th.appendChild(span);
  th.onclick = function() {
    if (currentSortColumn && this !== currentSortColumn) {
      // Currently sorted by another column
      currentSortColumn.childNodes[1].classList.remove(currentSortOrder);
      currentSortColumn.childNodes[1].classList.add("none");
      currentSortColumn = null;
      currentSortOrder = null;
    }
    if (currentSortColumn && this === currentSortColumn) {
      // Already sorted by this column
      if (currentSortOrder == "asc") {
        // Sort by this column, descending order
        bomSortFunction = function(a, b) {
          return -comparator(a, b);
        }
        currentSortColumn.childNodes[1].classList.remove("asc");
        currentSortColumn.childNodes[1].classList.add("desc");
        currentSortOrder = "desc";
      } else {
        // Unsort
        bomSortFunction = null;
        currentSortColumn.childNodes[1].classList.remove("desc");
        currentSortColumn.childNodes[1].classList.add("none");
        currentSortColumn = null;
        currentSortOrder = null;
      }
    } else {
      // Sort by this column, ascending order
      bomSortFunction = comparator;
      currentSortColumn = this;
      currentSortColumn.childNodes[1].classList.remove("none");
      currentSortColumn.childNodes[1].classList.add("asc");
      currentSortOrder = "asc";
    }
    populateBomBody();
  }
  return th;
}

function populateBomHeader() {
  while (bomhead.firstChild) {
    bomhead.removeChild(bomhead.firstChild);
  }
  var tr = document.createElement("TR");
  var th = document.createElement("TH");
  th.classList.add("numCol");
  tr.appendChild(th);
  var checkboxCompareClosure = function(checkbox) {
    return (a, b) => {
      var stateA = getCheckboxState(checkbox, a[3]);
      var stateB = getCheckboxState(checkbox, b[3]);
      if (stateA > stateB) return -1;
      if (stateA < stateB) return 1;
      return 0;
    }
  }
  if (settings.bommode == "netlist") {
    th = createColumnHeader("Net name", "bom-netname", (a, b) => {
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    });
    tr.appendChild(th);
  } else {
    for (var checkbox of settings.checkboxes) {
      th = createColumnHeader(
        checkbox, "bom-checkbox", checkboxCompareClosure(checkbox));
      th.onclick = fancyDblClickHandler(
        th, th.onclick.bind(th), checkboxSetUnsetAllHandler(checkbox));
      tr.appendChild(th);
    }
    tr.appendChild(createColumnHeader("References", "References", (a, b) => {
      var i = 0;
      while (i < a[3].length && i < b[3].length) {
        if (a[3][i] != b[3][i]) return a[3][i] > b[3][i] ? 1 : -1;
        i++;
      }
      return a[3].length - b[3].length;
    }));
    // Extra fields
    if (config.extra_fields.length > 0) {
      var extraFieldCompareClosure = function(fieldIndex) {
        return (a, b) => {
          var fa = a[4][fieldIndex];
          var fb = b[4][fieldIndex];
          if (fa != fb) return fa > fb ? 1 : -1;
          else return 0;
        }
      }
      for (var i in config.extra_fields) {
        tr.appendChild(createColumnHeader(
          config.extra_fields[i], "extra", extraFieldCompareClosure(i)));
      }
    }
    tr.appendChild(createColumnHeader("Value", "Value", (a, b) => {
      return valueCompare(a[5], b[5], a[1], b[1]);
    }));
    tr.appendChild(createColumnHeader("Footprint", "Footprint", (a, b) => {
      if (a[2] != b[2]) return a[2] > b[2] ? 1 : -1;
      else return 0;
    }));
    if (settings.bommode == "grouped") {
      tr.appendChild(createColumnHeader("Quantity", "Quantity", (a, b) => {
        return a[3].length - b[3].length;
      }));
    }
  }
  bomhead.appendChild(tr);
}

function populateBomBody() {
  while (bom.firstChild) {
    bom.removeChild(bom.firstChild);
  }
  highlightHandlers = [];
  footprintIndexToHandler = {};
  netsToHandler = {};
  currentHighlightedRowId = null;
  lockedRowId = null;
  var first = true;
  if (settings.bommode == "netlist") {
    bomtable = pcbdata.nets.slice();
  } else {
    switch (settings.canvaslayout) {
      case 'F':
        bomtable = pcbdata.bom.F.slice();
        break;
      case 'FB':
        bomtable = pcbdata.bom.both.slice();
        break;
      case 'B':
        bomtable = pcbdata.bom.B.slice();
        break;
    }
    if (settings.bommode == "ungrouped") {
      // expand bom table
      expandedTable = []
      for (var bomentry of bomtable) {
        for (var ref of bomentry[3]) {
          expandedTable.push([1, bomentry[1], bomentry[2], [ref], bomentry[4], bomentry[5]]);
        }
      }
      bomtable = expandedTable;
    }
  }
  if (bomSortFunction) {
    bomtable = bomtable.sort(bomSortFunction);
  }
  for (var i in bomtable) {
    var bomentry = bomtable[i];
    if (filter && !entryMatches(bomentry)) {
      continue;
    }
    var references = null;
    var netname = null;
    var tr = document.createElement("TR");
    var td = document.createElement("TD");
    var rownum = +i + 1;
    tr.id = "bomrow" + rownum;
    td.textContent = rownum;
    tr.appendChild(td);
    if (settings.bommode == "netlist") {
      netname = bomentry;
      td = document.createElement("TD");
      td.innerHTML = highlightFilter(netname ? netname : "&lt;no net&gt;");
      tr.appendChild(td);
    } else {
      if (reflookup) {
        references = findRefInEntry(bomentry);
        if (references.length == 0) {
          continue;
        }
      } else {
        references = bomentry[3];
      }
      // Checkboxes
      for (var checkbox of settings.checkboxes) {
        if (checkbox) {
          td = document.createElement("TD");
          var input = document.createElement("input");
          input.type = "checkbox";
          input.onchange = createCheckboxChangeHandler(checkbox, references, tr);
          setBomCheckboxState(checkbox, input, references);
          if (input.checked && settings.darkenWhenChecked == checkbox) {
            tr.classList.add("checked");
          }
          td.appendChild(input);
          tr.appendChild(td);
        }
      }
      // References
      td = document.createElement("TD");
      td.innerHTML = highlightFilter(references.map(r => r[0]).join(", "));
      tr.appendChild(td);
      // Extra fields
      for (var i in config.extra_fields) {
        td = document.createElement("TD");
        td.innerHTML = highlightFilter(bomentry[4][i]);
        tr.appendChild(td);
      }
      // Value
      td = document.createElement("TD");
      td.innerHTML = highlightFilter(bomentry[1]);
      tr.appendChild(td);
      // Footprint
      td = document.createElement("TD");
      td.innerHTML = highlightFilter(bomentry[2]);
      tr.appendChild(td);
      if (settings.bommode == "grouped") {
        // Quantity
        td = document.createElement("TD");
        td.textContent = bomentry[3].length;
        tr.appendChild(td);
      }
    }
    bom.appendChild(tr);
    let handler = createRowHighlightHandler(tr.id, references, netname);
    tr.onmousemove = function() {
      // While a row is locked (clicked), hovering must not steal the highlight.
      if (lockedRowId === null) handler();
    };
    tr.onclick = function(e) {
      // Checkbox clicks toggle state; don't hijack them for zooming.
      if (e.target.tagName == "INPUT") return;
      var rowid = e.currentTarget.id;
      if (lockedRowId == rowid) {
        setRowLock(null);
        return;
      }
      handler();
      setRowLock(rowid);
      zoomToHighlightedFootprints();
    };
    highlightHandlers.push({
      id: tr.id,
      handler: handler,
    });
    if (references !== null) {
      for (var refIndex of references.map(r => r[1])) {
        footprintIndexToHandler[refIndex] = handler;
      }
      // 记录该行的 值/封装，用于"盒子里有货"标注
      tr.dataset.binval = bomentry[1];
      tr.dataset.binfp = bomentry[2];
    }
    if (netname !== null) {
      netsToHandler[netname] = handler;
    }
    if ((filter || reflookup) && first) {
      handler();
      first = false;
    }
  }
  EventHandler.emitEvent(
    IBOM_EVENT_TYPES.BOM_BODY_CHANGE_EVENT,
    {
      filter: filter,
      reflookup: reflookup,
      checkboxes: settings.checkboxes,
      bommode: settings.bommode,
    });
  updateBomInBinMarks();
}

function highlightPreviousRow() {
  if (!currentHighlightedRowId) {
    highlightHandlers[highlightHandlers.length - 1].handler();
  } else {
    if (highlightHandlers.length > 1 &&
      highlightHandlers[0].id == currentHighlightedRowId) {
      highlightHandlers[highlightHandlers.length - 1].handler();
    } else {
      for (var i = 0; i < highlightHandlers.length - 1; i++) {
        if (highlightHandlers[i + 1].id == currentHighlightedRowId) {
          highlightHandlers[i].handler();
          break;
        }
      }
    }
  }
  if (lockedRowId !== null) setRowLock(currentHighlightedRowId);
  smoothScrollToRow(currentHighlightedRowId);
}

function highlightNextRow() {
  if (!currentHighlightedRowId) {
    highlightHandlers[0].handler();
  } else {
    if (highlightHandlers.length > 1 &&
      highlightHandlers[highlightHandlers.length - 1].id == currentHighlightedRowId) {
      highlightHandlers[0].handler();
    } else {
      for (var i = 1; i < highlightHandlers.length; i++) {
        if (highlightHandlers[i - 1].id == currentHighlightedRowId) {
          highlightHandlers[i].handler();
          break;
        }
      }
    }
  }
  if (lockedRowId !== null) setRowLock(currentHighlightedRowId);
  smoothScrollToRow(currentHighlightedRowId);
}

function populateBomTable() {
  populateBomHeader();
  populateBomBody();
  updateBinHighlight();
}

/* ------- 元器件盒 (parts bin) ------- */
// 全局共用：格子按「值+封装」存放，所有板卡的页面共享同一个盒子。

var footprintSpecs = {}; // footprint index -> [value, footprint]

function initFootprintSpecs() {
  footprintSpecs = {};
  for (var entry of pcbdata.bom.both) {
    for (var ref of entry[3]) {
      footprintSpecs[ref[1]] = [entry[1], entry[2]];
    }
  }
}

function currentHighlightedSpec() {
  if (highlightedFootprints.length == 0) return null;
  return footprintSpecs[highlightedFootprints[0]] || null;
}

// ---- 模糊匹配：值归一化 + 封装尺寸提取 ----
// 目的：盒子里写「1K0603」能匹配 BOM 里 值=1K / 封装=R0603_L 的行；
// 不同板卡的封装命名（R1206_L / R1206-HP_L）、阻值写法（510mR / 0.51R / 4K7 / 4.7K）都能对上。

function roundNum(x) {
  return parseFloat(x.toPrecision(12));
}

// 清理后的字符串 -> 规范标量（"r4700"/"f100000"/"h4700"），解析不了返回 null
function canonScalar(s) {
  var m;
  // 电阻，字母作小数点：4k7 / 4r7 / 4m7
  if ((m = s.match(/^(\d+)([rkm])(\d+)o?$/)))
    return "r" + roundNum(parseFloat(m[1] + "." + m[3]) * {r: 1, k: 1e3, m: 1e6}[m[2]]);
  // 毫欧：510mr / 5mΩ
  if ((m = s.match(/^(\d*\.?\d+)m[ro]$/)))
    return "r" + roundNum(parseFloat(m[1]) / 1000);
  // 欧姆：100r / 100Ω / 0.005r
  if ((m = s.match(/^(\d*\.?\d+)[ro]$/)))
    return "r" + roundNum(parseFloat(m[1]));
  // 千欧：4.7k / 68ko
  if ((m = s.match(/^(\d*\.?\d+)ko?$/)))
    return "r" + roundNum(parseFloat(m[1]) * 1e3);
  // 兆欧：1m / 3m
  if ((m = s.match(/^(\d*\.?\d+)m$/)))
    return "r" + roundNum(parseFloat(m[1]) * 1e6);
  // 电容（pF 基准），字母作小数点：4n7 / 4u7f
  if ((m = s.match(/^(\d+)([pnuμ])(\d+)f?$/)))
    return "f" + roundNum(parseFloat(m[1] + "." + m[3]) * {p: 1, n: 1e3, u: 1e6, "μ": 1e6}[m[2]]);
  // 电容：22p / 100nf / 10uf / 0.1μf
  if ((m = s.match(/^(\d*\.?\d+)([pnuμ])f?$/)))
    return "f" + roundNum(parseFloat(m[1]) * {p: 1, n: 1e3, u: 1e6, "μ": 1e6}[m[2]]);
  // 电感（nH 基准）：4u7h / 10uh / 10μh / 2.2mh / 100nh
  if ((m = s.match(/^(\d+)([nuμm])(\d+)h$/)))
    return "h" + roundNum(parseFloat(m[1] + "." + m[3]) * {n: 1, u: 1e3, "μ": 1e3, m: 1e6}[m[2]]);
  if ((m = s.match(/^(\d*\.?\d+)([nuμm])h$/)))
    return "h" + roundNum(parseFloat(m[1]) * {n: 1, u: 1e3, "μ": 1e3, m: 1e6}[m[2]]);
  // 三位数容量代码，统一按电容解读（不作电阻）：101=100pF、104=100nF、475=4.7uF
  if ((m = s.match(/^(\d\d)(\d)$/)))
    return "f" + roundNum(parseInt(m[1], 10) * Math.pow(10, parseInt(m[2], 10)));
  return null;
}

// 值 -> {main, volt}：把 10uF/25V 里的耐压 25V 单独拆出来。
// 拆分只在剩余部分能解析成阻/容/感值时才生效，芯片型号（SW6306V）不受影响。
function canonValueParts(value) {
  var s = String(value).toLowerCase();
  // 已知器件型号（二极管/MOS/三极管）不做数值解析，避免 1N4148 被误读成 1.4148nF
  if (guessComponentType(value)) {
    return {main: s.replace(/[^a-z0-9.μ]/g, ""), volt: "", watt: ""};
  }
  // 分数瓦数（1/8W）要在符号清理前提取，斜杠会被清掉
  var watt = "";
  var fw = s.match(/(\d+)\s*\/\s*(\d+)\s*w/);
  if (fw) {
    watt = "w" + roundNum(parseInt(fw[1], 10) / parseInt(fw[2], 10));
    s = s.replace(fw[0], "");
  }
  s = s.replace(/±?\d+(?:\.\d+)?%/g, "");            // 容差 ±10%
  s = s.replace(/x5r|x7r|x7s|y5v|np0|npo|c0g/g, ""); // 介质类型
  s = s.replace(/ohm|[ωΩ]|欧姆|欧/g, "o");
  s = s.replace(/[^a-z0-9.μ]/g, "");
  var main = canonScalar(s);
  if (main !== null) return {main: main, volt: "", watt: watt};
  // 在每个数字位置尝试拆出电压/瓦数（避免 10450v 这类连写被贪婪匹配整段吃掉），
  // 取剩余部分能解析成阻/容/感值的那种拆法。
  for (var j = 0; j < s.length; j++) {
    var m = s.slice(j).match(/^(\d+(?:\.\d+)?)(kv|v|w)/);
    if (!m) continue;
    var rest = s.slice(0, j) + s.slice(j + m[0].length);
    var restMain = canonScalar(rest);
    if (restMain !== null) {
      if (m[2] == "w") {
        return {main: restMain, volt: "", watt: "w" + roundNum(parseFloat(m[1]))};
      }
      return {
        main: restMain,
        volt: "v" + roundNum(parseFloat(m[1]) * (m[2] == "kv" ? 1000 : 1)),
        watt: watt
      };
    }
  }
  // 纯数字连写：三位容量代码 + 耐压数字，V 可省略（22610 = 226 + 10V）
  var mv = s.match(/^(\d{3})(\d{1,4})$/);
  if (mv) {
    var codeMain = canonScalar(mv[1]);
    if (codeMain !== null) {
      return {main: codeMain, volt: "v" + roundNum(parseFloat(mv[2])), watt: watt};
    }
  }
  return {main: s, volt: "", watt: watt};
}

function isCanonScalarMain(main) {
  return /^[rfh]\d+(?:\.\d+)?(?:e[+-]?\d+)?$/.test(main);
}

function valuesMatch(a, b) {
  var pa = canonValueParts(a);
  var pb = canonValueParts(b);
  if (pa.main != pb.main) {
    // 型号类（非阻容感数值）：一方是另一方的前缀也算匹配，
    // 如盒子写 RT9080 匹配 BOM 的 RT9080-33GB；短方至少 4 字符防误配。
    if (isCanonScalarMain(pa.main) || isCanonScalarMain(pb.main)) return false;
    var shorter = pa.main.length < pb.main.length ? pa.main : pb.main;
    var longer = pa.main.length < pb.main.length ? pb.main : pa.main;
    if (shorter.length < 4 || longer.indexOf(shorter) !== 0) return false;
  }
  // 一方没标耐压/瓦数则视为通配；双方都标了必须一致（25V 和 16V、1W 和 1/8W 是不同库存）
  if (pa.volt && pb.volt && pa.volt != pb.volt) return false;
  return !pa.watt || !pb.watt || pa.watt == pb.watt;
}

// 把解析结果还原成易读写法（悬停提示用），非阻容感返回 null
function formatValueParts(parts) {
  var m = parts.main.match(/^([rfh])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/);
  if (!m) return null;
  var num = parseFloat(m[2]);
  var text;
  if (m[1] == "r") {
    text = num >= 1e6 ? roundNum(num / 1e6) + "MΩ" :
           num >= 1e3 ? roundNum(num / 1e3) + "KΩ" : roundNum(num) + "Ω";
  } else if (m[1] == "f") {
    text = num >= 1e6 ? roundNum(num / 1e6) + "uF" :
           num >= 1e3 ? roundNum(num / 1e3) + "nF" : roundNum(num) + "pF";
  } else {
    text = num >= 1e6 ? roundNum(num / 1e6) + "mH" :
           num >= 1e3 ? roundNum(num / 1e3) + "uH" : roundNum(num) + "nH";
  }
  if (parts.volt) text += " / " + parseFloat(parts.volt.slice(1)) + "V";
  if (parts.watt) text += " / " + parseFloat(parts.watt.slice(1)) + "W";
  return text;
}

var binUserTypes = {}; // 用户自选类型库：归一化型号 -> 类型，全局共用

function binTypeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function saveBinUserTypes() {
  writeGlobalStorage("binUserTypes", JSON.stringify(binUserTypes));
}

// 按常见型号前缀猜器件类型（仅提示用，不参与匹配）；用户类型库优先
function guessComponentType(value) {
  var s = binTypeKey(value);
  if (binUserTypes[s]) return binUserTypes[s];
  if (/pmos/.test(s)) return "PMOS";
  if (/nmos/.test(s)) return "NMOS";
  if (/^(ao3401|ao3407|ao3415|si2301|si2305|irlml6402|cj2301)/.test(s)) return "PMOS";
  if (/^(ao3400|ao3402|si2302|2n7002|bss138|irlml2502|irlml6344|cj2302|nce\d)/.test(s)) return "NMOS";
  if (/^(s8050|s8550|ss8050|ss8550|s9012|s9013|s9014|s9015|s9018|2n3904|2n3906|mmbt|bc807|bc817|bc846|bc856)/.test(s)) return "三极管";
  if (/^(1n\d{3}|b5817|b5819|bat\d|mbr\d|sk[1-9]\d?|ss1\d|ss2\d|ss3\d|es[1-3][a-m]|m7$|us1[a-m]|rs1[a-m]|ll4148|ll4448|smaj|smbj|smf|1ss\d|bzt52|bzx84|zmm)/.test(s)) return "二极管";
  if (/^led|^发光/.test(s)) return "LED";
  return null;
}

// 值的完整识别描述（悬停提示/编辑预览共用）
function describeSpecValue(value) {
  var parts = canonValueParts(value);
  var parsed = formatValueParts(parts);
  if (parsed) {
    return {r: "电阻", f: "电容", h: "电感"}[parts.main[0]] + " " + parsed;
  }
  var guess = guessComponentType(value);
  return (guess ? guess + " " : "") + value + "（按字面匹配）";
}

var binSizeTokens = ["0201", "0402", "0603", "0805", "1206", "1210", "1808", "1812", "2010", "2220", "2512"];

function canonPackage(footprint) {
  var s = String(footprint).toLowerCase().replace(/[^a-z0-9]/g, "");
  for (var t of binSizeTokens) {
    if (s.includes(t)) return t;
  }
  return s;
}

function packagesMatch(a, b) {
  var ca = canonPackage(a);
  var cb = canonPackage(b);
  if (!ca || !cb) return true; // 空封装视为通配
  return ca == cb || ca.includes(cb) || cb.includes(ca);
}

function specsMatch(a, b) {
  return !!a && !!b &&
    valuesMatch(a[0], b[0]) &&
    packagesMatch(a[1], b[1]);
}

function saveBinAssignments() {
  writeGlobalStorage("binBoxes", JSON.stringify(binBoxes));
  writeGlobalStorage("binCurrentBox", binCurrentBox);
}

// 在所有盒子里找与 spec 重复的位置（可排除某一格）
function binFindSpecLocations(spec, excludeBox, excludeKey) {
  var result = [];
  for (var b = 0; b < binBoxes.length; b++) {
    for (var key in binBoxes[b].cells) {
      if (b == excludeBox && key == excludeKey) continue;
      if (specsMatch(binBoxes[b].cells[key], spec)) {
        result.push({box: b, key: key});
      }
    }
  }
  return result;
}

function binLocationText(loc) {
  return binBoxes[loc.box].name + " " + loc.key.replace("-", "行") + "列";
}

// 存放后如与其它格子重复，提醒用户
function binWarnIfDuplicate(spec, key) {
  var locs = binFindSpecLocations(spec, binCurrentBox, key);
  if (locs.length) {
    alert("注意：该元器件与以下位置重复：\n" + locs.map(binLocationText).join("\n"));
  }
}

// 盒子里有货的元件集合（footprint index），用于 PCB 与 BOM 的库存标注
var binAvailableFootprints = new Set();

function updateBinAvailability() {
  binAvailableFootprints = new Set();
  for (var i in footprintSpecs) {
    if (binFindSpecLocations(footprintSpecs[i], -1, null).length) {
      binAvailableFootprints.add(parseInt(i));
    }
  }
}

// 给"盒子里有货"的 BOM 行加背景标注
function updateBomInBinMarks() {
  if (!bom) return;
  for (var tr of bom.childNodes) {
    if (!tr.dataset || tr.dataset.binval === undefined) continue;
    var has = binFindSpecLocations([tr.dataset.binval, tr.dataset.binfp], -1, null).length > 0;
    tr.classList.toggle("inbin", has);
  }
}

// 盒子数据变化后刷新库存标注（BOM 行背景 + PCB 焊盘颜色）
function updateBinPresence() {
  updateBinAvailability();
  updateBomInBinMarks();
  redrawIfInitDone();
}

function findBinCellForSpec(spec) {
  for (var key in binAssignments) {
    if (specsMatch(binAssignments[key], spec)) return key;
  }
  return null;
}

// 同一种元器件（值+封装）只存放在一个格子里。
function binRemoveSpec(spec) {
  for (var key in binAssignments) {
    if (specsMatch(binAssignments[key], spec)) delete binAssignments[key];
  }
}

function updateBinHighlight() {
  var table = document.getElementById("binTable");
  if (!table) return;
  for (var el of table.querySelectorAll("td.binhl")) {
    el.classList.remove("binhl");
  }
  if (lockedRowId === null) return;
  var spec = currentHighlightedSpec();
  if (!spec) return;
  var key = findBinCellForSpec(spec);
  if (!key) {
    // 不在当前盒子里：去其它盒子找，找到就自动切换过去
    var locs = binFindSpecLocations(spec, binCurrentBox, null);
    if (locs.length == 0) return;
    binSelectBox(locs[0].box);
    key = locs[0].key;
  }
  var cell = document.getElementById("bincell-" + key);
  if (cell) {
    cell.classList.add("binhl");
    cell.scrollIntoView({block: "nearest", inline: "nearest"});
  }
}

function binCellClicked(key) {
  var cellSpec = binAssignments[key];
  var lockedSpec = (lockedRowId !== null) ? currentHighlightedSpec() : null;
  if (lockedSpec && cellSpec && specsMatch(cellSpec, lockedSpec)) {
    // 点已存放锁定行元器件的格子 = 取出
    delete binAssignments[key];
    saveBinAssignments();
    populateBinTable();
  } else if (cellSpec) {
    // 有料的格子：无论是否锁定，都跳转联动到对应 BOM 行（锁定 + 缩放 + 滚动）
    for (var i in footprintIndexToHandler) {
      if (specsMatch(footprintSpecs[i], cellSpec)) {
        footprintIndexToHandler[i]();
        setRowLock(currentHighlightedRowId);
        zoomToHighlightedFootprints();
        smoothScrollToRow(currentHighlightedRowId);
        break;
      }
    }
  } else if (lockedSpec) {
    // 空格子 + 有锁定行：存放
    binRemoveSpec(lockedSpec); // 同一盒子内是"移动"；其它盒子里的重复只提醒不删
    binAssignments[key] = lockedSpec;
    binWarnIfDuplicate(lockedSpec, key);
    saveBinAssignments();
    populateBinTable();
  }
  updateBinHighlight();
}

// 把输入文本解析成 [值, 封装]：支持「值 | 封装」或「1K0603」连写
function binParseInput(input) {
  var sep = input.indexOf("|");
  if (sep >= 0) {
    return [input.slice(0, sep).trim(), input.slice(sep + 1).trim()];
  }
  var m = input.replace(/\s+/g, "").match(
    new RegExp("^(.+?)(" + binSizeTokens.join("|") + ")$"));
  return m ? [m[1], m[2]] : [input, ""];
}

var binEditKey = null;

function binCellEdit(key) {
  binEditKey = key;
  document.getElementById("binEditTitle").textContent =
    "编辑格子 " + key.replace("-", " 行 ") + " 列";
  var input = document.getElementById("binEditInput");
  var spec = binAssignments[key];
  input.value = spec ? spec[0] : "";
  document.getElementById("binEditPkg").value = spec ? spec[1] : "";
  document.getElementById("binEditOverlay").style.display = "";
  binEditUpdatePreview();
  input.focus();
  input.select();
}

// 当前对话框内容 -> [值, 封装]（封装以封装框为准）
function binEditCurrentSpec() {
  var text = document.getElementById("binEditInput").value.trim();
  if (!text) return null;
  var spec = binParseInput(text);
  spec[1] = document.getElementById("binEditPkg").value.trim();
  return spec;
}

function binEditUpdatePreview() {
  var text = document.getElementById("binEditInput").value.trim();
  var el = document.getElementById("binEditPreview");
  var typeSel = document.getElementById("binEditType");
  var note = document.getElementById("binEditTypeNote");
  var pkgInput = document.getElementById("binEditPkg");
  var pkgNote = document.getElementById("binEditPkgNote");
  if (!text) {
    el.textContent = "留空 = 清除该格";
    typeSel.value = "";
    typeSel.disabled = true;
    note.textContent = "";
    pkgNote.textContent = "";
    return;
  }
  var spec = binParseInput(text);
  // 从连写/「值|封装」里识别出的封装自动填进封装框
  if (spec[1]) pkgInput.value = spec[1];
  var parts = canonValueParts(spec[0]);
  var parsed = formatValueParts(parts);
  if (parsed) {
    // 阻容感数值已解析，类型锁定
    typeSel.value = {r: "电阻", f: "电容", h: "电感"}[parts.main[0]];
    typeSel.disabled = true;
    note.textContent = "已自动识别";
  } else {
    typeSel.disabled = false;
    typeSel.value = binUserTypes[binTypeKey(spec[0])] || "";
    note.textContent = "认不出时可手选，会记住";
  }
  pkgNote.textContent = pkgInput.value.trim() ? "已识别" : "识别不了可手动填/选";
  binEditRenderPreviewLine();
}

// 只刷新预览行（封装/类型手动修改后调用，不重置各输入框）
function binEditRenderPreviewLine() {
  var text = document.getElementById("binEditInput").value.trim();
  if (!text) return;
  var spec = binEditCurrentSpec();
  var typeSel = document.getElementById("binEditType");
  var desc;
  if (!typeSel.disabled && typeSel.value) {
    desc = typeSel.value + " " + spec[0] + "（按字面匹配）";
  } else {
    desc = describeSpecValue(spec[0]);
  }
  document.getElementById("binEditPreview").textContent =
    "识别为: " + desc + (spec[1] ? " · " + spec[1] : "");
}

function binEditPkgChanged() {
  var pkgNote = document.getElementById("binEditPkgNote");
  pkgNote.textContent = document.getElementById("binEditPkg").value.trim() ? "" : "识别不了可手动填/选";
  binEditRenderPreviewLine();
}

// 手选类型后即时更新预览（仅型号类值可选）
function binEditTypeChanged() {
  binEditRenderPreviewLine();
}

function binEditConfirm() {
  if (binEditKey === null) return;
  var spec = binEditCurrentSpec();
  if (spec === null) {
    delete binAssignments[binEditKey];
  } else {
    // 手选的类型记进全局类型库（"自动" = 清除记录，恢复内置判断）
    var typeSel = document.getElementById("binEditType");
    if (!typeSel.disabled) {
      var k = binTypeKey(spec[0]);
      if (typeSel.value) {
        binUserTypes[k] = typeSel.value;
      } else {
        delete binUserTypes[k];
      }
      saveBinUserTypes();
    }
    binRemoveSpec(spec);
    binAssignments[binEditKey] = spec;
    binWarnIfDuplicate(spec, binEditKey);
  }
  saveBinAssignments();
  populateBinTable();
  updateBinHighlight();
  binEditCancel();
}

function binEditCancel() {
  binEditKey = null;
  document.getElementById("binEditOverlay").style.display = "none";
}

function binCellClear(key) {
  if (!binAssignments[key]) return;
  delete binAssignments[key];
  saveBinAssignments();
  populateBinTable();
  updateBinHighlight();
}

function populateBinTable() {
  var table = document.getElementById("binTable");
  if (!table) return;
  table.innerHTML = "";
  var dupCount = 0;
  var thead = document.createElement("THEAD");
  var tr = document.createElement("TR");
  tr.appendChild(document.createElement("TH")); // corner
  for (var c = 1; c <= settings.binCols; c++) {
    var th = document.createElement("TH");
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  var tbody = document.createElement("TBODY");
  for (var r = 1; r <= settings.binRows; r++) {
    tr = document.createElement("TR");
    var th = document.createElement("TH");
    th.textContent = r;
    tr.appendChild(th);
    for (var c = 1; c <= settings.binCols; c++) {
      let key = r + "-" + c;
      let td = document.createElement("TD");
      td.id = "bincell-" + key;
      var spec = binAssignments[key];
      if (spec) {
        td.classList.add("assigned");
        td.textContent = spec[0];
        td.title = key.replace("-", "行") + "列: " + spec[0] + " | " + spec[1] +
          "\n识别为: " + describeSpecValue(spec[0]) + (spec[1] ? " · " + spec[1] : "");
        var dups = binFindSpecLocations(spec, binCurrentBox, key);
        if (dups.length) {
          td.classList.add("dup");
          td.title += "\n⚠ 与 " + dups.map(binLocationText).join("、") + " 重复";
          dupCount++;
        }
      } else {
        td.title = key.replace("-", "行") + "列";
      }
      td.onclick = fancyDblClickHandler(td,
        function() { binCellClicked(key); },
        function() { binCellEdit(key); });
      td.oncontextmenu = function(e) {
        e.preventDefault();
        binCellClear(key);
      };
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  var warn = document.getElementById("binDupWarn");
  if (dupCount > 0) {
    warn.textContent = "⚠ " + dupCount + " 格重复";
    warn.style.display = "";
  } else {
    warn.style.display = "none";
  }
  updateBinPresence();
}

function setClickZoomMax(value) {
  settings.clickZoomMax = parseFloat(value) || 4;
  writeGlobalStorage("clickZoomMax", settings.clickZoomMax);
  document.getElementById("clickZoomDegree").textContent = settings.clickZoomMax;
}

function setBinSize() {
  var rows = parseInt(document.getElementById("binRowsInput").value);
  var cols = parseInt(document.getElementById("binColsInput").value);
  var box = binBoxes[binCurrentBox];
  if (rows >= 1 && rows <= 50) {
    box.rows = rows;
    settings.binRows = rows;
  }
  if (cols >= 1 && cols <= 50) {
    box.cols = cols;
    settings.binCols = cols;
  }
  saveBinAssignments();
  populateBinTable();
  updateBinHighlight();
}

/* ---- 盒子管理 ---- */

function populateBinBoxSelect() {
  var sel = document.getElementById("binBoxSelect");
  sel.innerHTML = "";
  for (var box of binBoxes) {
    var opt = document.createElement("OPTION");
    opt.textContent = box.name;
    sel.appendChild(opt);
  }
  sel.selectedIndex = binCurrentBox;
}

function binSelectBox(idx) {
  if (idx < 0 || idx >= binBoxes.length) return;
  binCurrentBox = idx;
  var box = binBoxes[idx];
  binAssignments = box.cells;
  settings.binRows = box.rows;
  settings.binCols = box.cols;
  document.getElementById("binRowsInput").value = box.rows;
  document.getElementById("binColsInput").value = box.cols;
  var sel = document.getElementById("binBoxSelect");
  if (sel.selectedIndex != idx) sel.selectedIndex = idx;
  writeGlobalStorage("binCurrentBox", idx);
  populateBinTable();
}

function binBoxAdd() {
  var name = prompt("新盒子名称:", "盒子" + (binBoxes.length + 1));
  if (name === null) return;
  name = name.trim() || ("盒子" + (binBoxes.length + 1));
  binBoxes.push({name: name, rows: 8, cols: 16, cells: {}});
  populateBinBoxSelect();
  binSelectBox(binBoxes.length - 1);
  saveBinAssignments();
}

function binBoxRename() {
  var box = binBoxes[binCurrentBox];
  var name = prompt("盒子名称:", box.name);
  if (name === null || !name.trim()) return;
  box.name = name.trim();
  populateBinBoxSelect();
  saveBinAssignments();
}

function binBoxDelete() {
  if (binBoxes.length <= 1) {
    alert("至少保留一个盒子。");
    return;
  }
  var box = binBoxes[binCurrentBox];
  var cells = Object.keys(box.cells).length;
  if (!confirm("删除盒子「" + box.name + "」？其中 " + cells + " 个格子的数据将一并删除。")) {
    return;
  }
  binBoxes.splice(binCurrentBox, 1);
  binCurrentBox = 0;
  populateBinBoxSelect();
  binSelectBox(0);
  saveBinAssignments();
}

function toggleBin() {
  var scroll = document.getElementById("binScroll");
  var collapsed = scroll.style.display != "none";
  scroll.style.display = collapsed ? "none" : "";
  document.getElementById("binToggleBtn").innerHTML = collapsed ? "&#9656;" : "&#9662;";
  writeGlobalStorage("binCollapsed", collapsed);
}

function exportBinData() {
  var data = {
    type: "InteractiveHtmlBom parts bin",
    version: 2,
    boxes: binBoxes,
    currentBox: binCurrentBox,
    binUserTypes: binUserTypes,
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
  saveFile("parts-bin.json", blob);
}

function binValidCells(cells) {
  var result = {};
  for (var key in cells) {
    if (Array.isArray(cells[key]) && cells[key].length == 2) {
      result[key] = cells[key];
    }
  }
  return result;
}

function importBinData() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function(e) {
    var reader = new FileReader();
    reader.onload = function(readerEvent) {
      var data;
      try {
        data = JSON.parse(readerEvent.target.result);
      } catch (err) {
        alert("文件不是有效的元器件盒数据。");
        return;
      }
      if (!data || data.type != "InteractiveHtmlBom parts bin") {
        alert("文件不是有效的元器件盒数据。");
        return;
      }
      var types = Object.keys(data.binUserTypes || {}).length;
      if (data.version >= 2 && Array.isArray(data.boxes)) {
        // v2：整套盒子替换
        var totalCells = 0;
        for (var b of data.boxes) {
          totalCells += Object.keys(b.cells || {}).length;
        }
        if (!confirm("将导入 " + data.boxes.length + " 个盒子（共 " + totalCells + " 格）、" +
          types + " 条类型记录。\n盒子数据会整体替换当前的，类型库合并。确定？")) {
          return;
        }
        binBoxes = [];
        for (var b of data.boxes) {
          binBoxes.push({
            name: String(b.name || ("盒子" + (binBoxes.length + 1))),
            rows: (b.rows >= 1 && b.rows <= 50) ? b.rows : 8,
            cols: (b.cols >= 1 && b.cols <= 50) ? b.cols : 16,
            cells: binValidCells(b.cells || {}),
          });
        }
        if (binBoxes.length == 0) {
          binBoxes = [{name: "盒子1", rows: 8, cols: 16, cells: {}}];
        }
        binCurrentBox = 0;
        populateBinBoxSelect();
        binSelectBox(0);
      } else {
        // v1：单盒子数据，只替换当前盒子
        var cells = Object.keys(data.binAssignments || {}).length;
        if (!confirm("将导入 " + cells + " 个格子、" + types + " 条类型记录。\n" +
          "格子数据会覆盖当前盒子，类型库合并。确定？")) {
          return;
        }
        var box = binBoxes[binCurrentBox];
        if (data.binRows >= 1 && data.binRows <= 50) box.rows = data.binRows;
        if (data.binCols >= 1 && data.binCols <= 50) box.cols = data.binCols;
        box.cells = binValidCells(data.binAssignments || {});
        binSelectBox(binCurrentBox);
      }
      for (var tk in data.binUserTypes) {
        if (typeof data.binUserTypes[tk] == "string") {
          binUserTypes[tk] = data.binUserTypes[tk];
        }
      }
      saveBinAssignments();
      saveBinUserTypes();
      updateBinHighlight();
    };
    reader.readAsText(e.target.files[0], "UTF-8");
  };
  input.click();
}

function initPartsBin() {
  initFootprintSpecs();
  binBoxes = [];
  try {
    var storedBoxes = JSON.parse(readGlobalStorage("binBoxes"));
    if (Array.isArray(storedBoxes)) {
      for (var b of storedBoxes) {
        if (b && typeof b == "object") {
          binBoxes.push({
            name: String(b.name || ("盒子" + (binBoxes.length + 1))),
            rows: (b.rows >= 1 && b.rows <= 50) ? b.rows : 8,
            cols: (b.cols >= 1 && b.cols <= 50) ? b.cols : 16,
            cells: binValidCells(b.cells || {}),
          });
        }
      }
    }
  } catch (e) {
    // ignore malformed stored data
  }
  if (binBoxes.length == 0) {
    // 兼容旧版单盒子数据（binAssignments/binRows/binCols）
    var oldCells = {};
    try {
      oldCells = binValidCells(JSON.parse(readGlobalStorage("binAssignments")) || {});
    } catch (e) {
      // ignore
    }
    binBoxes = [{
      name: "盒子1",
      rows: parseInt(readGlobalStorage("binRows")) || 8,
      cols: parseInt(readGlobalStorage("binCols")) || 16,
      cells: oldCells,
    }];
  }
  binCurrentBox = parseInt(readGlobalStorage("binCurrentBox")) || 0;
  if (binCurrentBox < 0 || binCurrentBox >= binBoxes.length) binCurrentBox = 0;
  if (readGlobalStorage("binCollapsed") == "true") {
    document.getElementById("binScroll").style.display = "none";
    document.getElementById("binToggleBtn").innerHTML = "&#9656;";
  }
  try {
    var storedTypes = JSON.parse(readGlobalStorage("binUserTypes"));
    for (var tk in storedTypes) {
      if (typeof storedTypes[tk] == "string") binUserTypes[tk] = storedTypes[tk];
    }
  } catch (e) {
    // ignore malformed stored data
  }
  var editInput = document.getElementById("binEditInput");
  var editKeydown = function(e) {
    e.stopPropagation(); // 别触发 BOM 表的上下键/快捷键
    if (e.key == "Enter") binEditConfirm();
    if (e.key == "Escape") binEditCancel();
  };
  editInput.oninput = binEditUpdatePreview;
  editInput.onkeydown = editKeydown;
  var pkgInput = document.getElementById("binEditPkg");
  pkgInput.oninput = binEditPkgChanged;
  pkgInput.onkeydown = editKeydown;
  document.getElementById("binEditType").onchange = binEditTypeChanged;
  populateBinBoxSelect();
  binSelectBox(binCurrentBox);
}

function footprintsClicked(footprintIndexes) {
  var lastClickedIndex = footprintIndexes.indexOf(lastClicked);
  for (var i = 1; i <= footprintIndexes.length; i++) {
    var refIndex = footprintIndexes[(lastClickedIndex + i) % footprintIndexes.length];
    if (refIndex in footprintIndexToHandler) {
      lastClicked = refIndex;
      footprintIndexToHandler[refIndex]();
      // A click on the PCB is explicit: move an existing lock along with it.
      if (lockedRowId !== null) setRowLock(currentHighlightedRowId);
      smoothScrollToRow(currentHighlightedRowId);
      break;
    }
  }
}

function netClicked(net) {
  if (net in netsToHandler) {
    netsToHandler[net]();
    if (lockedRowId !== null) setRowLock(currentHighlightedRowId);
    smoothScrollToRow(currentHighlightedRowId);
  } else {
    clearHighlightedFootprints();
    highlightedNet = net;
    drawHighlights();
  }
}

function updateFilter(input) {
  filter = input.toLowerCase();
  populateBomTable();
}

function updateRefLookup(input) {
  reflookup = input.toLowerCase();
  populateBomTable();
}

function changeCanvasLayout(layout) {
  document.getElementById("fl-btn").classList.remove("depressed");
  document.getElementById("fb-btn").classList.remove("depressed");
  document.getElementById("bl-btn").classList.remove("depressed");
  switch (layout) {
    case 'F':
      document.getElementById("fl-btn").classList.add("depressed");
      if (settings.bomlayout != "bom-only") {
        canvassplit.collapse(1);
      }
      break;
    case 'B':
      document.getElementById("bl-btn").classList.add("depressed");
      if (settings.bomlayout != "bom-only") {
        canvassplit.collapse(0);
      }
      break;
    default:
      document.getElementById("fb-btn").classList.add("depressed");
      if (settings.bomlayout != "bom-only") {
        canvassplit.setSizes([50, 50]);
      }
  }
  settings.canvaslayout = layout;
  writeStorage("canvaslayout", layout);
  resizeAll();
  changeBomMode(settings.bommode);
}

function populateMetadata() {
  document.getElementById("title").innerHTML = pcbdata.metadata.title;
  document.getElementById("revision").innerHTML = "Rev: " + pcbdata.metadata.revision;
  document.getElementById("company").innerHTML = pcbdata.metadata.company;
  document.getElementById("filedate").innerHTML = pcbdata.metadata.date;
  if (pcbdata.metadata.title != "") {
    document.title = pcbdata.metadata.title + " BOM";
  }
  // Calculate board stats
  var fp_f = 0, fp_b = 0, pads_f = 0, pads_b = 0, pads_th = 0;
  for (var i = 0; i < pcbdata.footprints.length; i++) {
    if (pcbdata.bom.skipped.includes(i)) continue;
    var mod = pcbdata.footprints[i];
    if (mod.layer == "F") {
      fp_f++;
    } else {
      fp_b++;
    }
    for (var pad of mod.pads) {
      if (pad.type == "th") {
        pads_th++;
      } else {
        if (pad.layers.includes("F")) {
          pads_f++;
        }
        if (pad.layers.includes("B")) {
          pads_b++;
        }
      }
    }
  }
  document.getElementById("stats-components-front").innerHTML = fp_f;
  document.getElementById("stats-components-back").innerHTML = fp_b;
  document.getElementById("stats-components-total").innerHTML = fp_f + fp_b;
  document.getElementById("stats-groups-front").innerHTML = pcbdata.bom.F.length;
  document.getElementById("stats-groups-back").innerHTML = pcbdata.bom.B.length;
  document.getElementById("stats-groups-total").innerHTML = pcbdata.bom.both.length;
  document.getElementById("stats-smd-pads-front").innerHTML = pads_f;
  document.getElementById("stats-smd-pads-back").innerHTML = pads_b;
  document.getElementById("stats-smd-pads-total").innerHTML = pads_f + pads_b;
  document.getElementById("stats-th-pads").innerHTML = pads_th;
  // Update version string
  document.getElementById("github-link").innerHTML = "InteractiveHtmlBom&nbsp;" +
    /^v\d+\.\d+/.exec(pcbdata.ibom_version)[0];
}

function changeBomLayout(layout) {
  document.getElementById("bom-btn").classList.remove("depressed");
  document.getElementById("lr-btn").classList.remove("depressed");
  document.getElementById("tb-btn").classList.remove("depressed");
  switch (layout) {
    case 'bom-only':
      document.getElementById("bom-btn").classList.add("depressed");
      if (bomsplit) {
        bomsplit.destroy();
        bomsplit = null;
        canvassplit.destroy();
        canvassplit = null;
      }
      document.getElementById("frontcanvas").style.display = "none";
      document.getElementById("backcanvas").style.display = "none";
      document.getElementById("bot").style.height = "";
      break;
    case 'top-bottom':
      document.getElementById("tb-btn").classList.add("depressed");
      document.getElementById("frontcanvas").style.display = "";
      document.getElementById("backcanvas").style.display = "";
      document.getElementById("bot").style.height = "calc(100% - 80px)";
      document.getElementById("bomdiv").classList.remove("split-horizontal");
      document.getElementById("canvasdiv").classList.remove("split-horizontal");
      document.getElementById("frontcanvas").classList.add("split-horizontal");
      document.getElementById("backcanvas").classList.add("split-horizontal");
      if (bomsplit) {
        bomsplit.destroy();
        bomsplit = null;
        canvassplit.destroy();
        canvassplit = null;
      }
      bomsplit = Split(['#bomdiv', '#canvasdiv'], {
        sizes: [50, 50],
        onDragEnd: resizeAll,
        direction: "vertical",
        gutterSize: 5
      });
      canvassplit = Split(['#frontcanvas', '#backcanvas'], {
        sizes: [50, 50],
        gutterSize: 5,
        onDragEnd: resizeAll
      });
      break;
    case 'left-right':
      document.getElementById("lr-btn").classList.add("depressed");
      document.getElementById("frontcanvas").style.display = "";
      document.getElementById("backcanvas").style.display = "";
      document.getElementById("bot").style.height = "calc(100% - 80px)";
      document.getElementById("bomdiv").classList.add("split-horizontal");
      document.getElementById("canvasdiv").classList.add("split-horizontal");
      document.getElementById("frontcanvas").classList.remove("split-horizontal");
      document.getElementById("backcanvas").classList.remove("split-horizontal");
      if (bomsplit) {
        bomsplit.destroy();
        bomsplit = null;
        canvassplit.destroy();
        canvassplit = null;
      }
      bomsplit = Split(['#bomdiv', '#canvasdiv'], {
        sizes: [50, 50],
        onDragEnd: resizeAll,
        gutterSize: 5
      });
      canvassplit = Split(['#frontcanvas', '#backcanvas'], {
        sizes: [50, 50],
        gutterSize: 5,
        direction: "vertical",
        onDragEnd: resizeAll
      });
  }
  settings.bomlayout = layout;
  writeStorage("bomlayout", layout);
  changeCanvasLayout(settings.canvaslayout);
}

function changeBomMode(mode) {
  document.getElementById("bom-grouped-btn").classList.remove("depressed");
  document.getElementById("bom-ungrouped-btn").classList.remove("depressed");
  document.getElementById("bom-netlist-btn").classList.remove("depressed");
  switch (mode) {
    case 'grouped':
      document.getElementById("bom-grouped-btn").classList.add("depressed");
      break;
    case 'ungrouped':
      document.getElementById("bom-ungrouped-btn").classList.add("depressed");
      break;
    case 'netlist':
      document.getElementById("bom-netlist-btn").classList.add("depressed");
  }
  writeStorage("bommode", mode);
  if (mode != settings.bommode) {
    settings.bommode = mode;
    bomSortFunction = null;
    currentSortColumn = null;
    currentSortOrder = null;
    clearHighlightedFootprints();
  }
  populateBomTable();
}

function focusFilterField() {
  focusInputField(document.getElementById("filter"));
}

function focusRefLookupField() {
  focusInputField(document.getElementById("reflookup"));
}

function toggleBomCheckbox(bomrowid, checkboxnum) {
  if (!bomrowid || checkboxnum > settings.checkboxes.length) {
    return;
  }
  var bomrow = document.getElementById(bomrowid);
  var checkbox = bomrow.childNodes[checkboxnum].childNodes[0];
  checkbox.checked = !checkbox.checked;
  checkbox.indeterminate = false;
  checkbox.onchange();
}

function checkBomCheckbox(bomrowid, checkboxname) {
  var checkboxnum = 0;
  while (checkboxnum < settings.checkboxes.length &&
    settings.checkboxes[checkboxnum].toLowerCase() != checkboxname.toLowerCase()) {
    checkboxnum++;
  }
  if (!bomrowid || checkboxnum >= settings.checkboxes.length) {
    return;
  }
  var bomrow = document.getElementById(bomrowid);
  var checkbox = bomrow.childNodes[checkboxnum + 1].childNodes[0];
  checkbox.checked = true;
  checkbox.indeterminate = false;
  checkbox.onchange();
}

function setBomCheckboxes(value) {
  writeStorage("bomCheckboxes", value);
  settings.checkboxes = value.split(",").filter((e) => e);
  prepCheckboxes();
  populateBomTable();
  populateDarkenWhenCheckedOptions();
}

function setDarkenWhenChecked(value) {
  writeStorage("darkenWhenChecked", value);
  settings.darkenWhenChecked = value;
  populateBomTable();
}

function prepCheckboxes() {
  var table = document.getElementById("checkbox-stats");
  while (table.childElementCount > 1) {
    table.removeChild(table.lastChild);
  }
  if (settings.checkboxes.length) {
    table.style.display = "";
  } else {
    table.style.display = "none";
  }
  for (var checkbox of settings.checkboxes) {
    var tr = document.createElement("TR");
    var td = document.createElement("TD");
    td.innerHTML = checkbox;
    tr.appendChild(td);
    td = document.createElement("TD");
    td.id = "checkbox-stats-" + checkbox;
    var progressbar = document.createElement("div");
    progressbar.classList.add("bar");
    td.appendChild(progressbar);
    var text = document.createElement("div");
    text.classList.add("text");
    td.appendChild(text);
    tr.appendChild(td);
    table.appendChild(tr);
    updateCheckboxStats(checkbox);
  }
}

function populateDarkenWhenCheckedOptions() {
  var container = document.getElementById("darkenWhenCheckedContainer");

  if (settings.checkboxes.length == 0) {
    container.parentElement.style.display = "none";
    return;
  }

  container.innerHTML = '';
  container.parentElement.style.display = "inline-block";

  function createOption(name, displayName) {
    var id = "darkenWhenChecked-" + name;

    var div = document.createElement("div");
    div.classList.add("radio-container");

    var input = document.createElement("input");
    input.type = "radio";
    input.name = "darkenWhenChecked";
    input.value = name;
    input.id = id;
    input.onchange = () => setDarkenWhenChecked(name);
    div.appendChild(input);

    // Preserve the selected element when the checkboxes change
    if (name == settings.darkenWhenChecked) {
      input.checked = true;
    }

    var label = document.createElement("label");
    label.innerHTML = displayName;
    label.htmlFor = id;
    div.appendChild(label);

    container.appendChild(div);
  }
  createOption("", "None");
  for (var checkbox of settings.checkboxes) {
    createOption(checkbox, checkbox);
  }
}

function updateCheckboxStats(checkbox) {
  var checked = getStoredCheckboxRefs(checkbox).size;
  var total = pcbdata.footprints.length - pcbdata.bom.skipped.length;
  var percent = checked * 100.0 / total;
  var td = document.getElementById("checkbox-stats-" + checkbox);
  td.firstChild.style.width = percent + "%";
  td.lastChild.innerHTML = checked + "/" + total + " (" + Math.round(percent) + "%)";
}

document.onkeydown = function(e) {
  switch (e.key) {
    case "n":
      if (document.activeElement.type == "text") {
        return;
      }
      if (currentHighlightedRowId !== null) {
        checkBomCheckbox(currentHighlightedRowId, "placed");
        highlightNextRow();
        e.preventDefault();
      }
      break;
    case "ArrowUp":
      highlightPreviousRow();
      e.preventDefault();
      break;
    case "ArrowDown":
      highlightNextRow();
      e.preventDefault();
      break;
    default:
      break;
  }
  if (e.altKey) {
    switch (e.key) {
      case "f":
        focusFilterField();
        e.preventDefault();
        break;
      case "r":
        focusRefLookupField();
        e.preventDefault();
        break;
      case "z":
        changeBomLayout("bom-only");
        e.preventDefault();
        break;
      case "x":
        changeBomLayout("left-right");
        e.preventDefault();
        break;
      case "c":
        changeBomLayout("top-bottom");
        e.preventDefault();
        break;
      case "v":
        changeCanvasLayout("F");
        e.preventDefault();
        break;
      case "b":
        changeCanvasLayout("FB");
        e.preventDefault();
        break;
      case "n":
        changeCanvasLayout("B");
        e.preventDefault();
        break;
      default:
        break;
    }
    if (e.key >= '1' && e.key <= '9') {
      toggleBomCheckbox(currentHighlightedRowId, parseInt(e.key));
    }
  }
}

function hideNetlistButton() {
  document.getElementById("bom-ungrouped-btn").classList.remove("middle-button");
  document.getElementById("bom-ungrouped-btn").classList.add("right-most-button");
  document.getElementById("bom-netlist-btn").style.display = "none";
}

window.onload = function(e) {
  initUtils();
  initRender();
  initStorage();
  initDefaults();
  cleanGutters();
  populateMetadata();
  dbgdiv = document.getElementById("dbg");
  bom = document.getElementById("bombody");
  bomhead = document.getElementById("bomhead");
  // 点击 BOM 表下方空白区域也解除锁定
  document.getElementById("bomtablescroll").onclick = function(e) {
    if (e.target === this) clearHighlightAndUnlock();
  };
  filter = "";
  reflookup = "";
  if (!("nets" in pcbdata)) {
    hideNetlistButton();
  }
  initDone = true;
  prepCheckboxes();
  initPartsBin();
  settings.clickZoomMax = parseFloat(readGlobalStorage("clickZoomMax")) || 4;
  document.getElementById("clickZoomMax").value = settings.clickZoomMax;
  document.getElementById("clickZoomDegree").textContent = settings.clickZoomMax;
  // Triggers render
  changeBomLayout(settings.bomlayout);

  // Users may leave fullscreen without touching the checkbox. Uncheck.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement)
      document.getElementById('fullscreenCheckbox').checked = false;
  });
}

window.onresize = resizeAll;
window.matchMedia("print").addListener(resizeAll);
