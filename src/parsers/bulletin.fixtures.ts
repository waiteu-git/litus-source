/**
 * CLASS掲示一覧（Xut12401）の実DOM由来fixture。各掲示は自己完結した <dl class="...keiji">。
 * COLLECT_BULLETIN_JS が dl.keiji の outerHTML を連結して送る想定なので、ここでもその形にする。
 * 各行の差分: 未読(title に fontBold) / 既読(fontBold なし) / 重要(exclamation に hiddenStyle なし) /
 * 新着(lightbulb に hiddenStyle なし) を網羅。
 */
export const BULLETIN_LIST_FIXTURE = `<div>
<dl id="keiji" class="floatLeft alignLeft textOf dispBlock keiji">
  <i class="fa fa-fw fa-exclamation-circle iconColorAttention iconSizeLM "></i>
  <i class="fa fa-fw fa-lightbulb-o iconColorNew iconSizeLM "></i>
  <span class="ui-widget-header keijiCategory">お知らせ(個人に対する)</span>
  <a id="funcForm:tabArea:0:j_idt238:0:j_idt295:0:j_idt301" href="https://class.admin.tus.ac.jp/uprx/up/xu/xut124/Xut12401.xhtml#" class="ui-commandlink ui-widget fontBold" onclick="PrimeFaces.ab({s:'x'});return false;">7月6日（月）以降の授業実施方法について（講義棟で授業を行います）</a> 2026/07/04
</dl>
<dl id="keiji" class="floatLeft alignLeft textOf dispBlock keiji">
  <i class="fa fa-fw fa-exclamation-circle iconColorAttention iconSizeLM "></i>
  <i class="fa fa-fw fa-lightbulb-o iconColorNew iconSizeLM "></i>
  <span class="ui-widget-header keijiCategory">お知らせ(個人に対する)</span>
  <a id="funcForm:tabArea:0:j_idt238:0:j_idt295:1:j_idt301" href="#" class="ui-commandlink ui-widget ">既読済みのお知らせ（表示テスト）</a> 2026/07/04
</dl>
<dl id="keiji" class="floatLeft alignLeft textOf dispBlock keiji">
  <i class="fa fa-fw fa-exclamation-circle iconColorAttention iconSizeLM hiddenStyle"></i>
  <i class="fa fa-fw fa-lightbulb-o iconColorNew iconSizeLM hiddenStyle"></i>
  <span class="ui-widget-header keijiCategory">お知らせ(個人に対する)</span>
  <a id="funcForm:tabArea:0:j_idt238:0:j_idt295:2:j_idt301" href="#" class="ui-commandlink ui-widget fontBold">2026年度前期期末「授業改善のためのアンケート」の実施について</a> 2026/07/03
</dl>
<dl id="keiji" class="floatLeft alignLeft textOf dispBlock keiji">
  <i class="fa fa-fw fa-exclamation-circle iconColorAttention iconSizeLM hiddenStyle"></i>
  <i class="fa fa-fw fa-lightbulb-o iconColorNew iconSizeLM hiddenStyle"></i>
  <span class="ui-widget-header keijiCategory">授業に関する</span>
  <a id="funcForm:tabArea:0:j_idt238:1:j_idt295:0:j_idt301" href="#" class="ui-commandlink ui-widget fontBold">【GPS-Academic】受検方法のお知らせ （B1）</a> 2026/07/01
</dl>
</div>`
