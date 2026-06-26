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

