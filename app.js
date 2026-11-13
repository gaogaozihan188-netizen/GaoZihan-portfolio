(() => {
  'use strict';
  const projects = window.portfolioProjects;
  const categories = window.portfolioCategories;
  const byId = id => document.getElementById(id);
  const gallery = byId('gallery');
  const dialog = byId('project-dialog');
  const stage = byId('hero-stage');
  const trails = byId('hero-trails');
  const heroReveal = byId('hero-reveal');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const coarse = matchMedia('(pointer: coarse)');
  let activeCategory = 'all';
  let currentId = null;
  let activeTrail = null;
  let trailSerial = 0;
  let cycle = 0;
  let lastPoint = null;
  let lastSpawn = 0;
  let settleTimer;
  let slideObserver;
  let visibleLimit = 12;
  const heroPool = window.portfolioHero || [];
  const heroVideoCache = new Map();
  const trailTimers = new WeakMap();

  function dismissTrail(card) {
    if (!card || !card.isConnected || card.classList.contains('leaving')) return;
    clearTimeout(trailTimers.get(card));
    slideObserver?.unobserve(card);
    card.querySelector('video')?.pause();
    if (activeTrail === card) {
      activeTrail = null;
      clearTimeout(settleTimer);
      heroReveal.hidden = !heroPool.length;
      byId('hero-hint').textContent = 'MOVE TO EXPLORE · 划过黑色画布，显现作品';
    }
    card.classList.remove('is-settled');
    card.classList.add('leaving');
    if (reduce.matches) card.remove();
    else setTimeout(() => card.remove(),200);
  }
  function expireTrail(card, delay = 800) {
    if (!card || mobile.matches || coarse.matches || card.classList.contains('leaving')) return;
    clearTimeout(trailTimers.get(card));
    trailTimers.set(card,setTimeout(() => dismissTrail(card),delay));
  }

  function safePlay(video, explicit = false) {
    if (!video || (reduce.matches && !explicit) || document.hidden) return;
    const result = video.play();
    if (result && result.catch) result.catch(() => {});
  }
  function pauseAll(except) {
    document.querySelectorAll('video').forEach(v => { if (v !== except) v.pause(); });
    document.querySelectorAll('.project-card.is-playing').forEach(el => el.classList.remove('is-playing'));
  }
  function setActiveTrail(card, play = true, explicit = false) {
    if (!card || !card.isConnected || card.classList.contains('leaving')) return;
    trails.querySelectorAll('.trail-card').forEach(el => {
      el.classList.toggle('is-old', el !== card);
      if (el !== card) { el.classList.remove('is-settled'); expireTrail(el,500); }
    });
    activeTrail = card;
    clearTimeout(trailTimers.get(card));
    const video = card?.querySelector('video');
    pauseAll(video);
    if (play) safePlay(video, explicit);
  }
  function settle() {
    if (!activeTrail || !activeTrail.isConnected || activeTrail.classList.contains('leaving') || dialog.open) return;
    clearTimeout(trailTimers.get(activeTrail));
    activeTrail.classList.add('is-settled');
    byId('hero-hint').textContent = mobile.matches || coarse.matches ? 'SWIPE TO EXPLORE · 轻触播放精选视频' : 'HOLD TO WATCH · 停留观看，移动继续探索';
    safePlay(activeTrail.querySelector('video'));
  }
  function createTrail(item, x, y, rotation = 0) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'trail-card';
    card.dataset.kind = item.kind;
    card.style.setProperty('--rotation', `${rotation}deg`);
    card.setAttribute('aria-label', `${item.label}，${item.project?'查看作品详情':'停留观看精选视频'}`);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.innerHTML = `<img src="${item.poster}" alt="${item.label}"><span class="trail-index">${String(++trailSerial).padStart(2,'0')}</span><span class="trail-label"><b>${item.label}</b><i>${item.project?'↗':'▶'}</i></span>`;
    if (item.kind === 'video') {
      let video = heroVideoCache.get(item.src);
      if(!video){
        video = document.createElement('video');
        video.src = item.src; video.poster = item.poster; video.muted = true; video.loop = true;
        video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-hidden','true');
        video.addEventListener('error', () => video.style.display = 'none');
        heroVideoCache.set(item.src,video);
      }
      card.insertBefore(video, card.querySelector('.trail-index'));
    }
    card.addEventListener('pointerenter', () => {
      if (dialog.open || card.classList.contains('leaving')) return;
      clearTimeout(settleTimer);
      setActiveTrail(card);
      card.classList.add('is-settled');
    });
    card.addEventListener('pointerleave', () => {
      if (!mobile.matches && !coarse.matches) dismissTrail(card);
    });
    card.addEventListener('focus', () => setActiveTrail(card));
    card.addEventListener('blur', () => {
      if (!mobile.matches && !coarse.matches) dismissTrail(card);
    });
    card.addEventListener('click', () => {
      if(item.project?.id)openProject(item.project.id);
      else {setActiveTrail(card,true,true);card.classList.add('is-settled');}
    });
    trails.append(card);
    if (mobile.matches || coarse.matches) slideObserver?.observe(card);
    // During a fast pointer trail, show posters. Start decoding only on dwell.
    setActiveTrail(card,false);
    expireTrail(card);
    const cards = [...trails.children].filter(el => !el.classList.contains('leaving'));
    if (!mobile.matches && !coarse.matches && cards.length > 3) {
      dismissTrail(cards[0]);
    }
    return card;
  }
  function initHero() {
    clearTimeout(settleTimer);
    slideObserver?.disconnect();
    [...trails.children].forEach(card => clearTimeout(trailTimers.get(card)));
    trails.querySelectorAll('video').forEach(v => v.pause());
    trails.replaceChildren();
    activeTrail = null;
    trailSerial = 0; cycle = 0; lastPoint = null; lastSpawn = -Infinity;
    heroReveal.hidden = !heroPool.length;
    byId('hero-hint').textContent = !heroPool.length ? 'SCROLL TO EXPLORE · 下滑，探索作品' : mobile.matches || coarse.matches
      ? 'TAP TO EXPLORE · 轻触显现精选作品'
      : 'MOVE TO EXPLORE · 划过黑色画布，显现作品';
  }
  heroReveal.addEventListener('click', () => {
    if (!heroPool.length) return;
    heroReveal.hidden = true;
    if (mobile.matches || coarse.matches) {
      heroPool.forEach(item => createTrail(item,0,0));
      setActiveTrail(trails.firstElementChild,true,true);
    } else {
      const cw = Math.min(245,Math.max(150,innerWidth*.17));
      const card=createTrail(heroPool[cycle++ % heroPool.length],Math.max(10,stage.clientWidth*.66-cw/2),Math.max(8,(stage.clientHeight-cw*1.5)/2));
      setActiveTrail(card,true,true);
    }
    settle();
  });
  stage.addEventListener('pointermove', event => {
    if (!heroPool.length || mobile.matches || coarse.matches || reduce.matches || dialog.open || event.target.closest('.trail-card')) return;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX-rect.left;
    const y = event.clientY-rect.top;
    clearTimeout(settleTimer);
    // Moving away ends a held preview, including one started by a mouse click.
    if (activeTrail?.classList.contains('is-settled')) dismissTrail(activeTrail);
    const dist = lastPoint ? Math.hypot(x-lastPoint.x,y-lastPoint.y) : 999;
    if (dist > 92 && performance.now()-lastSpawn > 190) {
      heroReveal.hidden = true;
      const cw = Math.min(245,Math.max(150,innerWidth*.17));
      const ch = cw*1.5;
      createTrail(heroPool[cycle++ % heroPool.length],Math.max(10,Math.min(rect.width-cw-10,x+24)),Math.max(8,Math.min(rect.height-ch-8,y-ch*.45)),((cycle%3)-1)*6);
      lastPoint={x,y}; lastSpawn=performance.now();
      byId('hero-hint').textContent='MOVE TO EXPLORE · 停下，看作品动起来';
    }
    settleTimer=setTimeout(settle,340);
  });
  stage.addEventListener('pointerleave', () => {
    clearTimeout(settleTimer); lastPoint=null;
    if (!mobile.matches && !coarse.matches) [...trails.children].forEach(dismissTrail);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) trails.querySelectorAll('video').forEach(v=>v.pause());
      else if (!dialog.open) safePlay(activeTrail?.querySelector('video'));
    }, {threshold:.1}).observe(stage);
    slideObserver = new IntersectionObserver(entries => {
      if ((!mobile.matches && !coarse.matches) || reduce.matches) return;
      entries.forEach(entry => { if (entry.intersectionRatio > .7 && !dialog.open) setActiveTrail(entry.target); });
    },{root:stage,threshold:.7});
    initHero();
    [...trails.children].forEach(card=>slideObserver.observe(card));
  } else initHero();

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const previewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting){entry.target.querySelector('video')?.pause();entry.target.classList.remove('is-playing');}
    });
  },{threshold:.05}) : null;
  const number = value => Number(value).toLocaleString('en-US');
  function credits(value) {
    if(value>=10000)return `${Number((value/10000).toFixed(2))}万`;
    return number(value);
  }
  function headlineMetrics(p) {
    const metrics=[];
    if(p.isNew) {
      if(p.metrics.credits!=null) metrics.push({value:credits(p.metrics.credits),label:'积分总消耗'});
      if(p.metrics.orders!=null) metrics.push({value:number(p.metrics.orders),label:'首购及积分订单'});
    } else {
      if(p.metrics.orders!=null) metrics.push({value:number(p.metrics.orders),label:'首购及积分订单'});
      if(p.metrics.credits!=null) metrics.push({value:credits(p.metrics.credits),label:'积分总消耗'});
    }
    return metrics;
  }
  function visibleProjects(){ return projects.filter(p=>activeCategory==='all'||p.category===activeCategory); }
  function projectCard(p,index) {
    const card=document.createElement('button');
    card.type='button'; card.className='project-card';
    card.dataset.project=p.id;
    card.setAttribute('aria-label',`${p.title}，点击观看完整视频与创作记录`);
    const cat=categories.find(c=>c.id===p.category);
    const badge=p.isNew?`<span class="badge-new">上新 ${p.onlineDays} 天</span>`:'';
    const visual=`<img src="${p.poster}" loading="lazy" decoding="async" width="${p.width}" height="${p.height}" alt="${escapeHTML(p.title)}视频封面"><video muted loop playsinline preload="none" poster="${p.poster}" data-src="${p.preview}" aria-hidden="true"></video><span class="project-number">${String(index+1).padStart(2,'0')} / ${cat.name.toUpperCase()}</span>${badge}<span class="project-play">▶</span>`;
    const metrics=headlineMetrics(p).map(m=>`<span class="project-metric"><strong>${m.value}</strong><span>${m.label}</span></span>`).join('');
    card.innerHTML=`<span class="project-visual" style="--aspect:${p.aspect}">${visual}</span><span class="project-heading"><h3>${escapeHTML(p.title)}</h3><span class="arrow">↗</span></span><span class="project-caption"><span>${cat.zh} / ${p.duration.toFixed(1)}s</span><span>VIEW PROJECT</span></span><span class="project-metrics">${metrics}</span>${p.metrics.conversion!=null?`<span class="conversion-caption">曝光→生成 ${p.metrics.conversion.toFixed(2)}%</span>`:''}`;
    const video=card.querySelector('video');
    const play=()=>{
      if(!video||dialog.open||reduce.matches||coarse.matches)return;
      pauseAll(video);
      if(!video.getAttribute('src'))video.src=video.dataset.src;
      safePlay(video);card.classList.add('is-playing');
    };
    video?.addEventListener('error',()=>card.classList.remove('is-playing'));
    card.addEventListener('pointerenter',play);
    card.addEventListener('focus',play);
    const stop=()=>{video?.pause();card.classList.remove('is-playing');};
    card.addEventListener('pointerleave',stop);card.addEventListener('blur',stop);
    card.addEventListener('click',()=>openProject(p.id));
    previewObserver?.observe(card);
    return card;
  }
  let columnCount=0;
  function renderGallery(){
    previewObserver?.disconnect();
    gallery.querySelectorAll('video').forEach(v=>v.pause());gallery.replaceChildren();
    columnCount=mobile.matches?2:3;
    const columns=Array.from({length:columnCount},()=>{const el=document.createElement('div');el.className='masonry-column';gallery.append(el);return el;});
    const heights=Array(columnCount).fill(0);
    const available=visibleProjects();
    const visible=available.slice(0,visibleLimit);
    visible.forEach((p,i)=>{
      const col=heights.indexOf(Math.min(...heights));
      columns[col].append(projectCard(p,projects.indexOf(p)));
      const [a,b]=p.aspect.split('/').map(Number);heights[col]+=b/a+.25;
    });
    byId('work-count').textContent=`${String(available.length).padStart(2,'0')} PROJECTS`;
    byId('loaded-count').textContent=`${String(visible.length).padStart(2,'0')} / ${String(available.length).padStart(2,'0')} WORKS`;
    byId('load-more').hidden=visible.length>=available.length;
    byId('category-caption').textContent=categories.find(c=>c.id===activeCategory).caption;
    document.querySelectorAll('.filter').forEach(btn=>{const selected=btn.dataset.filter===activeCategory;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));});
  }
  categories.forEach(c=>{
    const count=projects.filter(p=>!p.placeholder&&(c.id==='all'||p.category===c.id)).length;
    const btn=document.createElement('button');btn.type='button';btn.className='filter';btn.dataset.filter=c.id;btn.setAttribute('aria-pressed',String(c.id==='all'));
    btn.setAttribute('aria-label',`${c.name} ${c.zh}，${count}个真实案例`);
    btn.innerHTML=`${c.name}<sup>${String(count).padStart(2,'0')}</sup>`;
    btn.addEventListener('click',()=>{activeCategory=c.id;visibleLimit=12;renderGallery();});
    byId('filters').append(btn);
  });

  const workflowDialog=byId('workflow-dialog');
  const workflowImage=byId('workflow-image');
  const promptRecords=new Map();
  let workflowScale=1;
  let workflowReturnFocus=null;
  let workflowDrag=null;
  const productionType=type=>({image:'生图',video:'视频',audio:'音频',other:'处理'}[type]||'处理');
  const scalar=value=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  const displayAspectRatio=value=>/^adaptive$/i.test(scalar(value).trim())?'自适应':scalar(value)||'待核实';
  function displayParameterValue(item){
    const value=scalar(item.value);
    if(item.label!=='时长')return value;
    const duration=value.trim();
    if(duration==='-1')return '自动';
    return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(duration)?`${duration} 秒`:value;
  }
  function mediaSource(value){
    const src=typeof value==='string'?value:value?.src;
    return typeof src==='string'&&(/^(?:\/?assets\/|https:\/\/)/i.test(src)||/^data:image\/(?:png|jpeg|webp);base64,/i.test(src))?src:null;
  }
  function modelName(step){
    const name=typeof step.model==='string'?step.model:step.model?.name;
    return !name||/^comfy\s*ui$/i.test(name)?'底层模型待核实':name;
  }
  function modelDisplayName(step){
    const name=modelName(step);
    return ({'bytedance/seedance-2-fast':'Seedance 2 Fast','seedance-2.0-mini':'Seedance 2.0 Mini'})[name]||name;
  }
  function modelVersion(step){return typeof step.model==='object'?scalar(step.model?.version):'';}
  function workflowReference(production){
    return [production.workflowId,production.version?`版本 ${production.version}`:null].filter(Boolean).join(' / ');
  }
  function renderProduction(p){
    const production=p.production;
    const modelSection=byId('detail-model-section');
    const making=byId('detail-making');
    const panel=byId('detail-making-panel');
    panel.open=false;promptRecords.clear();
    modelSection.hidden=true;byId('detail-models').replaceChildren();
    if(!production){
      making.innerHTML='<p class="production-empty">此作品的制作流程、模型与提示词尚待归档。</p>';
      return;
    }
    const steps=Array.isArray(production.steps)?production.steps.filter(step=>step&&typeof step==='object'):[];
    const modelSteps=steps.filter(step=>step.type==='image'||step.type==='video'||step.model?.name||typeof step.model==='string');
    if(modelSteps.length){
      modelSection.hidden=false;
      byId('detail-production-kind').textContent=production.selfDeveloped?'自研流程':'';
      const seen=new Set();
      byId('detail-models').innerHTML=modelSteps.filter(step=>{
        const key=[step.type,modelName(step),modelVersion(step)].join('|');
        if(seen.has(key))return false;seen.add(key);return true;
      }).map(step=>{
        const version=modelVersion(step);
        const note=version||((step.nodeType&&/comfy/i.test(step.nodeType))?'ComfyUI 工作流':(step.model?.status==='verified'?'': '模型版本待核实'));
        return `<div class="model-tile"><span class="model-role">${productionType(step.type)}</span><div><strong title="${escapeHTML(modelName(step))}">${escapeHTML(modelDisplayName(step))}</strong>${note?`<small>${escapeHTML(note)}</small>`:''}</div></div>`;
      }).join('');
    }
    const screenshot=mediaSource(production.screenshot);
    const reference=workflowReference(production);
    const workflow=screenshot?`<figure class="production-workflow"><button type="button" class="workflow-thumbnail" data-workflow-open aria-label="放大查看工作流截图"><span class="workflow-thumbnail-heading"><span>Workflow / 工作流串联</span><span>查看大图 ↗</span></span><img data-workflow-src="${escapeHTML(screenshot)}" alt="${escapeHTML(p.title)}工作流节点连接截图" decoding="async" loading="lazy"><span class="workflow-load-error" hidden>截图暂时无法加载，点击重试原图。</span></button>${reference?`<figcaption>${escapeHTML(reference)}</figcaption>`:''}</figure>`:'';
    const renderedSteps=steps.map((step,index)=>{
      const type=productionType(step.type);
      const version=modelVersion(step);
      const hasModel=step.type==='image'||step.type==='video'||(typeof step.model==='string'?step.model.trim():step.model?.name);
      const model=hasModel?`<span><b>模型</b>${escapeHTML(modelName(step))}${version?` · ${escapeHTML(version)}`:''}</span>`:'';
      const ratio=step.type==='image'||step.type==='video'?`<span><b>画布比例</b>${escapeHTML(displayAspectRatio(step.aspectRatio))}</span>`:'';
      const nodeType=step.nodeType&&/comfy/i.test(step.nodeType)?'<p class="production-step-note">流程引擎：ComfyUI；生成模型以该步骤实际模型配置为准。</p>':'';
      const parameters=Array.isArray(step.parameters)?step.parameters.filter(item=>item&&item.label&&item.value!=null&&!/(?:prompt|提示词|token|credential|api.?key|access.?key|密钥|鉴权)/i.test(item.label)).map(item=>`<span><b>${escapeHTML(item.label)}</b>${escapeHTML(displayParameterValue(item))}</span>`).join(''):'';
      let prompt='';
      if(!production.selfDeveloped&&!step.promptOmitted&&typeof step.prompt==='string'&&step.prompt.trim()){
        const key=`prompt-${index}`;promptRecords.set(key,step.prompt);
        const promptLabel=`第 ${index+1} 步 ${step.title||type}`;
        prompt=`<details class="production-prompt" data-prompt-key="${key}"><summary>查看${type}提示词<span aria-hidden="true">+</span></summary><div class="prompt-body"><pre tabindex="0" aria-label="${escapeHTML(promptLabel)}完整提示词"><code></code></pre><button type="button" class="copy-prompt" data-copy-prompt="${key}" aria-label="复制${escapeHTML(promptLabel)}完整提示词">复制全文</button><span class="prompt-copy-status" aria-live="polite"></span></div></details>`;
      } else if(!production.selfDeveloped&&!step.promptOmitted&&(step.type==='image'||step.type==='video')){
        prompt='<p class="production-step-note">此步骤的提示词尚待核实。</p>';
      }
      return `<section class="production-step"><div class="production-step-title"><span>${String(index+1).padStart(2,'0')}</span><h4>${escapeHTML(step.title||type)}</h4><small>${type}</small></div><div class="production-step-meta">${model}${ratio}${parameters}</div>${nodeType}${prompt}</section>`;
    }).join('');
    const notes=Array.isArray(production.notes)?production.notes.filter(note=>typeof note==='string'&&note.trim()):[];
    const nodeGuide=steps.length?'<p class="production-step-note">以下为节点信息，实际连接与分支关系见工作流图。</p>':'';
    making.innerHTML=`${workflow}${nodeGuide}${renderedSteps}${production.selfDeveloped?'<p class="production-self-note">自研版本 · 提示词省略</p>':''}${!workflow&&!steps.length?'<p class="production-empty">此作品的工作流与模型记录尚待归档。</p>':''}${notes.length?`<details class="production-notes"><summary>归档说明</summary>${notes.map(note=>`<p>${escapeHTML(note)}</p>`).join('')}</details>`:''}`;
    const thumbnail=making.querySelector('img[data-workflow-src]');
    if(thumbnail)thumbnail.addEventListener('error',()=>{thumbnail.hidden=true;making.querySelector('.workflow-load-error').hidden=false;});
    making.querySelectorAll('.production-prompt').forEach(details=>details.addEventListener('toggle',()=>{
      if(details.open&&!details.dataset.loaded){details.querySelector('code').textContent=promptRecords.get(details.dataset.promptKey)||'';details.dataset.loaded='true';}
    }));
  }
  byId('detail-making-panel').addEventListener('toggle',()=>{
    if(!byId('detail-making-panel').open)return;
    const image=byId('detail-making').querySelector('img[data-workflow-src]');
    if(image&&!image.getAttribute('src'))image.src=image.dataset.workflowSrc;
  });
  byId('detail-making').addEventListener('click',async event=>{
    const workflowButton=event.target.closest('[data-workflow-open]');
    if(workflowButton){
      const p=projects.find(item=>item.id===currentId);const src=mediaSource(p?.production?.screenshot);if(!src)return;
      workflowReturnFocus=workflowButton;
      byId('workflow-title').textContent=`${p.title} / 工作流`;
      byId('workflow-reference').textContent=workflowReference(p.production);
      byId('workflow-image-error').hidden=true;workflowImage.hidden=false;
      workflowImage.alt=`${p.title}工作流节点连接原图`;
      workflowImage.style.width='100%';workflowImage.src=src;
      if(!workflowDialog.open)workflowDialog.showModal();
      byId('workflow-pan').scrollTo(0,0);
      if(workflowImage.complete&&workflowImage.naturalWidth)fitWorkflow();
      return;
    }
    const button=event.target.closest('[data-copy-prompt]');if(!button)return;
    const prompt=promptRecords.get(button.dataset.copyPrompt);if(!prompt)return;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(prompt);
      else{
        const field=document.createElement('textarea');field.value=prompt;field.setAttribute('readonly','');field.className='clipboard-field';dialog.append(field);field.select();
        const copied=document.execCommand('copy');field.remove();if(!copied)throw new Error('copy-unavailable');
      }
      button.closest('.prompt-body').querySelector('.prompt-copy-status').textContent='完整提示词已复制。';
    }catch{
      const code=button.closest('.prompt-body').querySelector('code');
      const selection=getSelection();const range=document.createRange();range.selectNodeContents(code);selection?.removeAllRanges();selection?.addRange(range);
      button.closest('.prompt-body').querySelector('.prompt-copy-status').textContent='已选中全文，可手动复制。';
    }
  });
  function applyWorkflowScale(scale){
    if(!workflowImage.naturalWidth)return;
    workflowScale=Math.min(4,Math.max(.05,scale));
    workflowImage.style.width=`${Math.round(workflowImage.naturalWidth*workflowScale)}px`;
    byId('workflow-zoom-value').textContent=`${Math.round(workflowScale*100)}%`;
  }
  function fitWorkflow(){applyWorkflowScale(Math.min(1,(byId('workflow-pan').clientWidth-32)/workflowImage.naturalWidth));}
  function closeWorkflow(){if(workflowDialog.open)workflowDialog.close();}
  workflowImage.addEventListener('load',fitWorkflow);
  workflowImage.addEventListener('error',()=>{workflowImage.hidden=true;byId('workflow-image-error').hidden=false;});
  byId('workflow-fit').addEventListener('click',fitWorkflow);
  byId('workflow-zoom-in').addEventListener('click',()=>applyWorkflowScale(workflowScale*1.25));
  byId('workflow-zoom-out').addEventListener('click',()=>applyWorkflowScale(workflowScale/1.25));
  byId('close-workflow').addEventListener('click',closeWorkflow);
  const workflowPan=byId('workflow-pan');
  workflowPan.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0||(workflowPan.scrollWidth<=workflowPan.clientWidth&&workflowPan.scrollHeight<=workflowPan.clientHeight))return;
    workflowDrag={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:workflowPan.scrollLeft,top:workflowPan.scrollTop};
    workflowPan.setPointerCapture(event.pointerId);workflowPan.classList.add('is-dragging');event.preventDefault();
  });
  workflowPan.addEventListener('pointermove',event=>{
    if(!workflowDrag||event.pointerId!==workflowDrag.pointer)return;
    workflowPan.scrollLeft=workflowDrag.left-(event.clientX-workflowDrag.x);workflowPan.scrollTop=workflowDrag.top-(event.clientY-workflowDrag.y);event.preventDefault();
  });
  const endWorkflowDrag=()=>{if(workflowDrag&&workflowPan.hasPointerCapture(workflowDrag.pointer))workflowPan.releasePointerCapture(workflowDrag.pointer);workflowDrag=null;workflowPan.classList.remove('is-dragging');};
  workflowPan.addEventListener('pointerup',endWorkflowDrag);workflowPan.addEventListener('pointercancel',endWorkflowDrag);workflowPan.addEventListener('lostpointercapture',endWorkflowDrag);
  workflowDialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();closeWorkflow();});
  workflowDialog.addEventListener('click',event=>{if(event.target===workflowDialog){const r=workflowDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeWorkflow();}});
  workflowDialog.addEventListener('close',()=>{endWorkflowDrag();workflowImage.removeAttribute('src');if(dialog.open&&workflowReturnFocus?.isConnected)workflowReturnFocus.focus();workflowReturnFocus=null;});
  dialog.addEventListener('cancel',event=>{if(workflowDialog.open){event.preventDefault();closeWorkflow();}});

  function openProject(id){
    const p=projects.find(p=>p.id===id);if(!p)return;
    closeWorkflow();
    currentId=id;clearTimeout(settleTimer);pauseAll();
    const category=categories.find(c=>c.id===p.category);
    byId('detail-category').textContent=`${category.name.toUpperCase()} / ${category.zh}${p.isNew?` / 上新 ${p.onlineDays} 天`:''}`;
    byId('detail-title').textContent=p.title;
    byId('detail-summary').textContent=p.summary;
    const player=byId('detail-player');player.querySelectorAll('video').forEach(v=>v.pause());
    player.innerHTML=`<video class="detail-video" controls playsinline preload="metadata" poster="${p.poster}" src="${p.video}" aria-label="${escapeHTML(p.title)}完整视频"></video>`;
    // 详情不强制开启声音或自动播放；用户可用原生播放和音量控件观看。
    const input=byId('detail-input');
    input.innerHTML=`<div><strong>WATCH THE FULL EFFECT / 完整成片</strong>点击播放，开启声音观看。${p.isNew?`<br>上新 ${p.onlineDays} 天的成绩对应 ${p.asOf} 截图记录。`:''}</div>`;
    byId('detail-meta').innerHTML=`<span>9:16 / ${p.duration.toFixed(1)}s</span>${p.publishedAt?`<span>上线 ${p.publishedAt.replaceAll('-','.')}</span>`:''}${p.production?.templateId?`<span class="detail-template-id">TTID ${escapeHTML(p.production.templateId)}</span>`:''}`;
    const detailMetrics=headlineMetrics(p);
    if(p.metrics.conversion!=null)detailMetrics.push({value:p.metrics.conversion.toFixed(2)+'%',label:'曝光→生成转化率 UV'});
    byId('detail-metrics').innerHTML=detailMetrics.length?detailMetrics.map(m=>`<div class="detail-metric"><span>${m.label}</span><strong>${m.value}</strong></div>`).join(''):'<p class="metric-note">此作品的上线数据尚待归档。</p>';
    byId('metric-note').textContent=`截图采集于 ${p.asOf.replaceAll('-','.')} · 积分按原始缩写精度展示。`;
    byId('detail-definitions').innerHTML=`<p>订单：${p.metricDefinitions.orders}</p><p>积分：${p.metricDefinitions.credits}</p>${p.metrics.conversion!=null?`<p>转化：${p.metricDefinitions.conversion}</p>`:''}<p>截图未显示独立统计区间；上新天数按上线日到截图采集日计算，固定对应这次成绩快照。</p>`;
    dialog.querySelector('.detail-source').open=false;
    renderProduction(p);
    const list=visibleProjects();const index=list.findIndex(item=>item.id===id);
    byId('detail-counter').textContent=`${String(index+1).padStart(2,'0')} / ${String(list.length).padStart(2,'0')}`;
    byId('prev-project').disabled=index<=0;byId('next-project').disabled=index===list.length-1;
    if(!dialog.open){dialog.showModal();document.body.classList.add('modal-open');}
    dialog.scrollTop=0;
  }
  byId('close-detail').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{
    closeWorkflow();promptRecords.clear();
    byId('detail-player').querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
    document.body.classList.remove('modal-open');currentId=null;
  });
  function navigateProject(delta){const list=visibleProjects();const index=list.findIndex(p=>p.id===currentId);const p=list[index+delta];if(p)openProject(p.id);}
  byId('prev-project').addEventListener('click',()=>navigateProject(-1));
  byId('next-project').addEventListener('click',()=>navigateProject(1));
  byId('load-more').addEventListener('click',()=>{visibleLimit+=12;renderGallery();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();});
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const cols=mobile.matches?2:3;if(cols!==columnCount){renderGallery();initHero();}},200);});
  reduce.addEventListener('change',()=>{if(reduce.matches)pauseAll();initHero();});
  const experienceGrid = document.querySelector('.experience-grid');
  if (experienceGrid && 'IntersectionObserver' in window && !reduce.matches) {
    const experienceObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      experienceGrid.classList.add('is-revealing');
      experienceObserver.disconnect();
    }, { threshold: .12 });
    experienceObserver.observe(experienceGrid);
    // Remove the entrance animation so hover scale remains responsive afterwards.
    experienceGrid.lastElementChild.addEventListener('animationend', () => experienceGrid.classList.remove('is-revealing'), { once: true });
  }
  renderGallery();
})();
