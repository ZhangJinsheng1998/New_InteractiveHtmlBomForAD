# InteractiveHtmlBomForAD

[InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom), a beatiful plugin in KiCad, this is a implementation in AD10 just with basic function. please refer to the original project for more functions.

将[InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom)这个插件作了一些修改，使其能在AD中运行，这里只实现基础的功能，更多的功能请参考原项目。


### 安装和使用 Installation and Usage 
 1. 运行一次Initianlize.bat
 <font color=#00008B>Run Initialize.bat once.</font>
 2. 用AD打开InteractiveHtmlBomForAD.PrjScr, 打开pcb文件，打开Run Script...窗口，运行main()函数，生成ibom。
 <font color=#00008B>Open InteractiveHtmlBomForAD.PrjScr in AD, open a pcbdoc and open *Run Script...* dialog then run main() function to generate ibom.</font>
 3. 关于脚本安装和运行的细节，请善用搜索...
  <font color=#00008B>For more details about running scripts in AD, please search on Internet...</font>

#### Link to original project for more info.

* [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom)

---

### 修复记录 (2026-06-26)

主要修复「生成的 ibom 网页 PCB 图显示不全」的问题。根因是浏览器端 canvas 是顺序绘制的，
某个元素绘制时一旦抛异常，它之后的所有元素就都不再绘制，于是表现为「画到一半、显示不全」。
四层板元件多、更容易触发。

修复内容：

1. **异形/未知焊盘（含 Mark 点）导致整板渲染中断**
   - 报错：`Uncaught TypeError: shape.polygons is not iterable`（`getPolygonsPath` ← `drawPad`）。
   - 原因：`ecad/AD10.js` 的 `parsePad` 把无法识别的焊盘形状标成 `"custom"`，却从未生成 `polygons` 数据；渲染端 `web/render.js` 的 `getPolygonsPath` 遍历 `undefined` 直接抛错。
   - 修复：
     - 源端：`parsePad` 的 `default` 分支由 `"custom"` 改为退化成 `"rect"`，从源头杜绝缺几何的焊盘。
     - 渲染端：`getPolygonsPath` 在 `polygons` 缺失时按 `size` 退化成矩形。

2. **文本/字库健壮性（`web/render.js` 的 `drawText`）**
   - 文本对象无内容（如隐藏文本、条码文本被导出成空对象）时直接跳过。
   - 字库 `font_data` 中缺少某字符时跳过该字符，不再读取 `undefined.w / undefined.l`。

3. **绘制循环兜底（`web/render.js`）**
   - `drawFootprints`、`drawBgLayer` 的循环体加 `try/catch`：今后任何单个坏元件只跳过它自己，
     绝不再让整块板白屏，并在浏览器控制台打印 `跳过无法绘制的元件 Xxx` 方便定位。

4. **八边形焊盘画错修正（`ecad/AD10.js`）**
   - AD 八边形（shape=3）映射为 `chamfrect`，原代码把 `chamfpos` 误设成坐标数组、`chamfratio` 设为 0.5。
   - 修正为 `chamfpos = 15`（四角全切的位掩码）、`chamfratio = 0.2929`（`1/(2+sqrt(2))`，使八条边等长），画出正确的八边形。

5. **板框默认层改为 Mechanical 1（`core/config.js`）**
   - 在缺少 `config.ini` 时，`PcbOutlineMech1` 默认值由 `false`（Keep-Out Layer）改为 `true`（Mechanical 1），
     避免板框轮廓取不到而缺失。

6. **1 脚（pin1）误标修正（`ecad/AD10.js`）**
   - 原代码 `"A1".indexOf(Prim.Name)` 会把空焊盘名、以及名为 `"A"` 的焊盘也误标成 1 脚。
   - 修正为仅当焊盘名是 `"1"` 或 `"A1"`（BGA）时标记 1 脚。

7. **字体渲染加固，中文/特殊字符不再崩溃（`core/newstroke_font.js`）**
   - `parseFontChar` 对字库未覆盖的字符回退成 `?`，不再因读取 `undefined` 而中断 AD 生成脚本。
   - 字库本身已包含完整 CJK，丝印中文可正常渲染；超出范围的字符最多显示为 `?`。

8. **补充 MIT LICENSE**，保留原项目（openscopeproject）与 AD 移植作者的署名。

9. **后端解析整体容错（`ecad/AD10.js`）**
   - `parsePcb` 的 5 个主解析循环（板框、元件、自由焊盘/过孔、丝印、铜箔/敷铜）全部加 `try/catch`：
     单个元件/图元解析失败时只跳过它自己并计数，不再中断整张 PCB 的生成。
   - 生成结束后若有跳过，会弹窗提示 `Warning: N object(s) failed to parse and were skipped.`，方便排查。

### 功能更新 (2026-07-16)

10. **点击 BOM 行自动缩放定位到元件（`web/render.js`、`web/ibom.js`）**
    - 原版（含上游 KiCad 插件）里 BOM 行只有悬停高亮，点击不会移动 PCB 视图。
    - 新增：点击 BOM 行后，前/后两个 PCB 视图自动平移并缩放，把该行对应的元件（多个引用则取整体包围盒）
      居中显示，元件约占视图三分之一；缩放范围限制在 1~100 倍。
    - 点击行内勾选框不触发缩放；右键 PCB 仍可复位视图。支持板旋转（boardRotation）状态下正确定位。

11. **点击 BOM 行锁定高亮（`web/ibom.js`、`web/ibom.css`）**
    - 原版高亮是悬停触发的，鼠标扫过别的行就会把高亮抢走。
    - 新增：点击某行后锁定该行（深绿底色 + 绿色边框），悬停不再切换高亮；再次点击该行解锁，
      恢复悬停跟随；点击其它行则锁定转移到新行。
    - 锁定状态下点击 PCB 上的元件/网络会把锁定转移过去；点击 PCB 空白处清除高亮并解锁；
      键盘上下键切换行时锁定跟随移动；切换 BOM 模式/过滤重建表格时自动解锁。

### 功能更新 (2026-07-17)

12. **元器件盒面板（`web/ibom.html`、`web/ibom.css`、`web/ibom.js`、`web/util.js`）**
    - 左侧 BOM 区分成上下两部分：上面 BOM 表（独立滚动），下面"元器件盒"网格，
      对照实物元器件收纳盒使用。默认 8 行 × 16 列，行/列数可在面板顶部修改（1~50），可折叠。
    - 网格带行号、列号表头（滚动时表头吸附）；样式沿用 BOM 表的字体、边框和高亮配色。
    - **全局共用一个盒子**：格子按「值 + 封装」（如 `100R | R1206_L`）存放，而不是按位号，
      所以所有板卡生成的网页共享同一份盒子数据（存于浏览器 localStorage 全局键
      `InteractiveHtmlBom_global__#`），与板卡标题/版本无关，重新导出、改版本都不受影响。
    - 存放：点击 BOM 行锁定后，单击某格把该行元器件（值+封装）放入，格子显示值，悬停提示
      完整"值 | 封装"；再次单击已存放它的格子取出；同一种元器件只能存在一个格子里。
    - 联动：点击 BOM 行时对应格子高亮（与锁定行同款绿色描边）并滚动到可见位置，grouped /
      ungrouped 模式都能匹配；反过来，无锁定行时单击已存放的格子反查锁定 BOM 行、缩放定位 PCB。
    - 编辑：双击格子弹出**居中对话框**（不再用浏览器顶部的 prompt），可直接连写如 `1K0603`、
      `10150V0603`（自动拆成值+耐压+封装），也可用 `值 | 封装` 格式；输入时实时显示
      「识别为: 100pF / 50V · 0603」预览，确认前就能核对解析结果；回车确定、Esc 取消、
      点遮罩关闭；留空清除；右键格子直接清空。悬停已存放格子同样显示识别结果。
    - 注意：数据存在本机浏览器里，换电脑/换浏览器/清除站点数据不会跟随。

13. **元器件盒模糊匹配（`web/ibom.js`）**
    - 盒子标注和 BOM 写法不必完全一致，匹配时自动归一化：
      - 阻值：`4K7` = `4.7K` = `4700Ω`，`510mR` = `0.51R`，`100R` = `100Ω`；
      - 容值：`100nF` = `0.1uF`，`4n7` = `4.7nF`（pF 基准）；感值同理（nH 基准）；
      - 电容耐压：`10uF/25V`、`10uF25V`、`25V 10uF` 视为同一种；一方没标耐压则按通配处理
        （盒子写 `10uF` 可匹配任何耐压），双方都标了则必须一致（25V 与 16V 是两种库存，不混）；
        支持 kV（`2KV` = `2000V`）；容差（`±10%`）和介质标注（X5R/X7R/Y5V/NP0/C0G）自动忽略；
        芯片型号里的 V（如 `SW6306V`）不会被误认成耐压；
      - 三位数容量代码统一按**电容**解读（不作电阻）：`101` = `100pF`，`104` = `100nF` = `0.1uF`，
        `475` = `4.7uF`，可与明确写法互相匹配，也可带耐压（`104/50V`）；
      - 封装：从封装名里提取尺寸码（0201/0402/0603/0805/1206/1210/1808/1812/2010/2220/2512），
        `0603` 能匹配 `R0603_L`、`C0603` 等任意命名；`R1206_L` 与 `R1206-HP_L` 视为同尺寸；
        无尺寸码时按字符串包含关系匹配（如 `SOT23-5` ⊂ `SOT23-5M`）；
      - 格子封装留空视为通配（只按值匹配）。
    - 非阻容感的值（芯片型号等）按去符号、忽略大小写的字符串精确匹配。

