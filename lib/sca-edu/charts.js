// Shared chart data drives accessible web SVG and editable PowerPoint charts.
const colors = ['222222', '888888', '555555'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => Number(value.toFixed(2)).toString();

export function validateChart(chart) {
  if (!['bar', 'line', 'scatter', 'radar'].includes(chart.kind)) throw new Error('Unknown education chart type');
  if (!chart.categories?.length || !chart.series?.length || chart.max <= (chart.min ?? 0)) throw new Error('Invalid education chart axes');
  for (const series of chart.series) {
    if (series.values.length !== chart.categories.length || series.values.some(v => !Number.isFinite(v) || v < (chart.min ?? 0) || v > chart.max)) throw new Error('Invalid education chart values');
  }
  if (chart.kind === 'scatter' && (!chart.xValues || chart.xValues.length !== chart.categories.length || chart.xMax <= chart.xMin || chart.xValues.some(v => !Number.isFinite(v) || v < chart.xMin || v > chart.xMax))) throw new Error('Invalid scatter chart values');
  return chart;
}

export function chartSvg(input) {
  const c = validateChart(input), parts = [];
  const tx = (x, y, value, anchor = 'middle', fill = '#333', size = 22) => parts.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-size="${size}">${escape(value)}</text>`);
  const line = (x1, y1, x2, y2, stroke = '#ddd', width = 1.5) => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`);
  const legend = () => c.series.forEach((s, i) => { line(115 + i * 255, 25, 150 + i * 255, 25, `#${colors[i % colors.length]}`, 4); tx(160 + i * 255, 32, s.name, 'start'); });
  const min = c.min ?? 0;
  if (c.kind === 'radar') {
    const cx = 400, cy = 222, radius = 133, n = c.categories.length;
    const point = (i, r) => [cx + Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n) * r, cy + Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n) * r];
    for (let ring = 1; ring <= 3; ring++) {
      parts.push(`<polygon points="${c.categories.map((_, i) => point(i, radius * ring / 3).join(',')).join(' ')}" fill="none" stroke="#ddd" stroke-width="1.5"/>`);
      tx(cx + 9, cy - radius * ring / 3 + 20, number(c.max * ring / 3), 'start', '#666', 18);
    }
    c.categories.forEach((label, i) => { const [x,y] = point(i, radius); line(cx,cy,x,y); const [lx,ly] = point(i,radius+34); tx(lx,ly+7,label); });
    c.series.forEach((s, j) => parts.push(`<polygon points="${s.values.map((v,i) => point(i,radius*v/c.max).join(',')).join(' ')}" fill="none" stroke="#${colors[j%colors.length]}" stroke-width="4" ${j ? 'stroke-dasharray="9 5"' : ''}/>`));
    legend();
  } else {
    const left=90, right=755, top=75, bottom=325, width=right-left, height=bottom-top;
    const y = value => bottom-(value-min)/(c.max-min)*height;
    const x = i => c.kind === 'scatter' ? left+(c.xValues[i]-c.xMin)/(c.xMax-c.xMin)*width : c.kind === 'bar' ? left+(i+0.5)*width/c.categories.length : left+i*width/Math.max(1,c.categories.length-1);
    for(let i=0;i<=4;i++){ const value=min+(c.max-min)*i/4; line(left,y(value),right,y(value)); tx(left-14,y(value)+7,number(value),'end'); }
    line(left,top,left,bottom,'#555'); line(left,bottom,right,bottom,'#555');
    tx(left,57,c.yLabel,'start','#555',20);
    if(c.kind==='scatter') {
      for(let i=0;i<=4;i++){const value=c.xMin+(c.xMax-c.xMin)*i/4;tx(left+i*width/4,359,number(value));}
    } else c.categories.forEach((label,i)=>tx(x(i),359,label,'middle','#333',c.categories.length>7 ? 18 : 22));
    tx((left+right)/2,393,c.xLabel ?? '', 'middle','#555',20);
    c.series.forEach((s,j)=>{
      const color=`#${colors[j%colors.length]}`;
      if(c.kind==='line') parts.push(`<polyline points="${s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="4" ${j ? 'stroke-dasharray="9 5"' : ''}/>`);
      s.values.forEach((v,i)=>{
        if(c.kind==='bar'){
          const group=width/c.categories.length*0.64, bar=group/c.series.length;
          parts.push(`<rect x="${x(i)-group/2+j*bar}" y="${y(v)}" width="${bar-3}" height="${bottom-y(v)}" fill="${color}"/>`);
          tx(x(i)-group/2+(j+0.5)*bar,y(v)-10,number(v),'middle',color);
        }else{
          parts.push(`<circle cx="${x(i)}" cy="${y(v)}" r="6" fill="${color}"/>`);
          if(c.kind==='scatter') tx(x(i)+12,y(v)-12,c.categories[i],'start',color);
        }
      });
    });
    if(c.series.length>1) legend();
  }
  const description=c.series.map(s=>s.name+': '+s.values.map((v,i)=>`${c.categories[i]} ${v}`).join(', ')).join('; ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" role="img" aria-label="${escape(c.alt)}" style="width:100%;height:100%;font-family:inherit"><title>${escape(c.alt)}</title><desc>${escape(description)}</desc>${parts.join('')}</svg>`;
}

export function addPptxChart(slide, pres, sh, font) {
  const c=validateChart(sh.chart);
  const data=c.kind==='scatter'
    ? [{ name:c.xLabel, values:c.xValues }, ...c.series.map(s=>({ name:s.name, labels:c.categories, values:s.values }))]
    : c.series.map(s=>({ name:s.name, labels:c.categories, values:s.values }));
  slide.addChart(pres.ChartType[c.kind], data, {
    x:sh.x,y:sh.y,w:sh.w,h:sh.h,
    catAxisLabelFontFace:font,valAxisLabelFontFace:font,legendFontFace:font,dataLabelColor:'333333',
    catAxisLabelFontSize:15,valAxisLabelFontSize:15,legendFontSize:15,dataLabelFormatCode:'0.##',dataLabelFormatScatter:'custom',dataLabelBkgrdColor:'FFFFFF',dataLabelPosition:'t',
    catAxisTitle:c.xLabel,catAxisTitleFontFace:font,catAxisTitleFontSize:16,
    valAxisTitle:c.yLabel,valAxisTitleFontFace:font,valAxisTitleFontSize:16,
    showCatAxisTitle:c.kind!=='radar',showValAxisTitle:c.kind!=='radar',
    showCatName:false,showTitle:false,showLegend:c.series.length>1,legendPos:'b',
    showValue:c.kind==='bar',showLabel:c.kind==='scatter',
    valAxisMinVal:c.min??0,valAxisMaxVal:c.max,valAxisMajorUnit:(c.max-(c.min??0))/4,valLabelFormatCode:'0.##',
    ...(c.kind==='scatter'?{catAxisMinVal:c.xMin,catAxisMaxVal:c.xMax,catAxisMajorUnit:(c.xMax-c.xMin)/4}:{}),
    chartColors:colors,catAxisLabelColor:'444444',valAxisLabelColor:'444444',
    valGridLine:{color:'DDDDDD',width:0.7},catAxisLineColor:'888888',valAxisLineColor:'888888',
    showBorder:false,showMarker:true,lineDataSymbol:'circle',lineDataSymbolSize:5,lineSize:c.kind==='scatter'?0:2,
    lineSmooth:false,barDir:'col',barGrouping:'clustered',radarStyle:'marker',
  });
}
