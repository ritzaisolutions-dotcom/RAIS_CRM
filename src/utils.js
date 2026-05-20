export function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
export function td() { return new Date().toISOString().slice(0,10); }

export function relAge(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((new Date(td()) - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7)  return 'vor ' + diff + 'd';
  if (diff < 30) return 'vor ' + Math.floor(diff/7) + 'w';
  if (diff < 365)return 'vor ' + Math.floor(diff/30) + 'mo';
  return 'vor ' + Math.floor(diff/365) + 'j';
}

export const GKUERZEL = {
  'Fliesenleger':'FL','Elektriker':'EL','Sanitär':'SAN','Heizung':'HZG',
  'Maler':'MAL','Zimmerer':'ZIM','Dachdecker':'DACH','Schreiner':'SCHR',
  'Schlosser':'SLS','Gerüstbauer':'GRST','Gartenbau':'GAR','Reinigung':'REI','Sonstiges':'SON'
};
export const GSLUG = {
  'Fliesenleger':'fl','Elektriker':'el','Sanitär':'san','Heizung':'hzg',
  'Maler':'mal','Zimmerer':'zim','Dachdecker':'dach','Schreiner':'schr',
  'Schlosser':'sls','Gerüstbauer':'grst','Gartenbau':'gar','Reinigung':'rei','Sonstiges':'son'
};
export function gewerkKuerzel(g) { return GKUERZEL[g] || g.slice(0,3).toUpperCase(); }
export function gewerkSlug(g)    { return GSLUG[g]    || 'son'; }
