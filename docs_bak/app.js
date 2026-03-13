let selectedLocation = null;
let selectedCategory = null;

async function loadRootAndChildren() {
  const roots = await (await fetch('/locations')).json();
  const root = roots[0];
  const children = await (await fetch('/locations?parentId=' + root.id)).json();
  const select = document.getElementById('location');
  select.innerHTML = children.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  selectedLocation = children[0]?.id || null;
  select.onchange = () => { selectedLocation = select.value; if (selectedCategory) loadCatalog(); };
}

async function loadCatalog() {
  const list = document.getElementById('list');
  if (!selectedLocation || !selectedCategory) return;
  const url = `/catalog?locationId=${selectedLocation}&category=${selectedCategory}`;
  const rows = await (await fetch(url)).json();
  if (!rows.length) {
    list.innerHTML = '<div>Пока нет предложений</div>';
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="item">
      <b>${r.title}</b><br/>
      <small>${r.partner_name}</small>
      <div class="row">
        <a class="btn" target="_blank" href="https://t.me/BaikalRent_bot?start=lead_${r.id}">Забронировать</a>
        <a class="btn" target="_blank" href="https://t.me/BaikalRent_bot">Чат с менеджером</a>
      </div>
    </div>
  `).join('');
}

document.querySelectorAll('button[data-cat]').forEach(btn => {
  btn.onclick = () => { selectedCategory = btn.dataset.cat; loadCatalog(); };
});

loadRootAndChildren();
