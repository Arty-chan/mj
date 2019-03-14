if (typeof process !== "undefined") {
  document = require('./dom-shim.js');
}

/**
 * Create a <span data-tile="..."></span> element
 * from a specified tile number. Also, because it's
 * such a frequent need, this adds a `getTileFace()`
 * function to the span itself.
 */
const create = (tileNumber, hidden) => {
  let span = document.createElement('span');
  span.className = 'tile';
  span.dataset.tile = tileNumber;

  span.getFrom = () => (span.dataset.from|0);
  span.setFrom = (pid) => (span.dataset.from = pid);

  span.hide = () => (span.dataset.hidden = 'hidden');
  span.isHidden = () => (!!span.dataset.hidden);
  span.reveal = () => { delete span.dataset.hidden; };

  if (tileNumber < 34) {
    if (hidden) { span.hide(); }
  } else {
    span.dataset.bonus = 'bonus';
    span.dataset.locked = 'locked';
  }

  span.getTileFace = () => (span.dataset.tile|0);
  span.getTileSuit = () => {
    let num = span.getTileFace();
    if (num < 9) return 0;
    if (num < 18) return 1;
    if (num < 27) return 2;
    if (num < 30) return 3;
    return 4;
  };
  span.copy = () => {
    let copy = span.cloneNode();
    copy.getTileFace = () => (copy.dataset.tile|0);
    copy.getTileSuit = () => {
      let num = copy.getTileFace();
      if (num < 9) return 0;
      if (num < 18) return 1;
      if (num < 27) return 2;
      if (num < 30) return 3;
      return 4;
    };
    return copy;
  }
  return span;
}

/**
 * A tree to list-of-paths unrolling function.
 */
function unroll(list, seen=[], result=[]) {
  list = list.slice();
  seen.push(list.shift());
  if (!list.length) result.push(seen);
  else list.forEach(tail => unroll(tail, seen.slice(), result));
  return result;
}

if (typeof process !== "undefined") {
  module.exports = { create, unroll };
}
