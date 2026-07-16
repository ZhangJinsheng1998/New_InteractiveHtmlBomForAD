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

