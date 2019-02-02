const Constants = {
  NOTHING:        -1,
  SINGLE:          0,
  GAPPED:          1,
  CONNECTED:       2,
  CHOW:            4,
  PAIR:            8,
  PUNG:           16,
  KONG:           32,
  CONCEALED_KONG: 64,
  SET:           128,
  REQUIRED:      256,
  WIN:           512,
};

const hash = set => {
  let s = `T(${set.type})`;
  if (set.type<8) { s = `${s}t(${set.tile})`; }
  if (set.subtype) { s = `${s}s(${set.subtype})`; }
  return s;
};

class Pattern {
  constructor(tiles=[]) {
    this.keys = [];
    this.tiles = {};
    tiles.slice().sort((a,b)=>a-b).forEach(v => {
      if (this.tiles[v] === undefined) {
        this.tiles[v] = 0;
      }
      this.tiles[v]++;
      this.keys.push(v);
    });
  }
  copy() {
    let p = new Pattern();
    p.keys = this.keys.slice();
    p.keys.forEach(k => (p.tiles[k] = this.tiles[k]));
    return p;
  }
  remove(tiles) {
    if (!tiles.forEach) tiles = [tiles];
    tiles.forEach(t => {
      this.tiles[t]--;
      if (this.tiles[t] === 0) {
        delete this.tiles[t];
        this.keys = Object.keys(this.tiles).sort((a,b)=>a-b);
      }
    });
  }
  recurse(processed, set, result) {
    set.forEach(s => {
      if (s.required) {
        s.required.forEach(tile => {
          if (!result[tile]) result[tile] = [];
          let print = hash(s);
          let list = result[tile];
          if (list.indexOf(print) === -1) list.push(print);
        });
      }
    });
    let downstream = this.copy();
    downstream.remove(processed);
    if (downstream.keys.length > 0) downstream.expand(result);
  }
  getChowInformation(tile) {
    let suit = (tile / 9)|0;
    let t1 = this.tiles[tile+1];

    if (t1 !== undefined && (((tile+1)/9)|0)!==suit) {
      t1 = undefined;
    }

    let t2 = this.tiles[tile+2];

    if (t2 !== undefined && (((tile+2)/9)|0)!==suit) {
      t2 = undefined;
    }

    return { t1, t2};
  }
  checkForChow(tile, result) {
    if (tile > 26) return;

    let {t1, t2} = this.getChowInformation();

    if (t1 || t2) {
      if (t1 && t2) { // this is already a chow!
        let set = [
          { required: false, type: Constants.CHOW, tile }
        ];
        this.recurse([tile, t1, t2], set, result);
      }
      else if (t1) { // connected pair, we just need the last tile
        let set = [
          { required: [tile + 2], type: Constants.CHOW, subtype: 2, tile }
        ];
        this.recurse([tile, tile + 1], set, result);
      }
      else if (t2) { // gapped pair, we just need the middle tile
        let set = [
          { required: [tile + 1], type: Constants.CHOW, subtype: 1, tile }
        ];
        this.recurse([tile, tile + 2], set, result);
      }
    }
  }
  expand(result=[]) {
    let tile = this.keys[0]|0;
    let count = this.tiles[tile];

    if (count===4) {
      // special case: if we already have four, we have all
      // the tiles that are in the game, and there isn't going
      // to be any discard to claim.
      let set = [
        { required: false, type: Constants.KONG, tile }
      ];
      this.recurse([tile, tile, tile, tile], set, result);
    }

    else {
      this.checkForChow(tile, result);

      if (count===1) {
        let set = [
          { required: [tile], type: Constants.PAIR, tile }
        ];
        this.recurse([tile], set, result);
      }
      if (count===2) {
        let set = [
          { required: false, type: Constants.PAIR, tile },
          { required: [tile], type: Constants.PUNG, tile }
        ];
        this.recurse([tile, tile], set, result);
      }
      if (count===3) {
        let set = [
          { required: false, type: Constants.PAIR, tile },
          { required: false, type: Constants.PUNG, tile },
          { required: [tile], type: Constants.KONG, tile }
        ];
        this.recurse([tile, tile, tile], set, result);
      }
    }

    return result;
  }
  markWin(results, tile, subtype) {
    if (!results[tile]) results[tile] = [];
    let print = hash({type: Constants.WIN, tile, subtype});
    if (results[tile].indexOf(print) === -1) results[tile].push(print);
  }
  recurseForWin(processed, results, single, pair, set) {
    let downstream = this.copy();
    downstream.remove(processed);
    if (downstream.keys.length > 0) {
      downstream.determineWin(results, single, pair, set);
    } else {
      // let msg = false;
      // check whether the resulting single/pair/set counts suggest a possible win:
      if (set.length===4 && pair.length===0 && single.length===1) {
        // msg = `waiting for ${single[0]} for a pair:`;
        this.markWin(results, single[0], Constants.PAIR);
      }
      else if (set.length===3 && pair.length===2) {
        // msg = `waiting for ${pair[0]} or ${pair[1]} for a pung:`;
        this.markWin(results, pair[0], Constants.PUNG);
        this.markWin(results, pair[1], Constants.PUNG);
      }
      else if (set.length===3 && pair.length===1 && single.length===2) {
        if (single[1] < 27 && single[0] + 1 === single[1]) {
          // msg = `waiting for ${single[0]-1} or ${single[1]+1} for a chow:`;
          let t1 = single[0]-1, s1 = (t1/9)|0,
              b0 = single[0],   s2 = (b0/9)|0,
              b1 = single[1],   s3 = (b1/9)|0,
              t2 = single[1]+1, s4 = (t2/9)|0;
          if(s1 === s2 && s1 === s3) this.markWin(results, t1, Constants.CHOW);
          if(s4 === s2 && s4 === s3) this.markWin(results, t2, Constants.CHOW);
        }
        else if (single[1] < 27 && single[0] + 2 === single[1]) {
          // msg = `waiting for ${single[0]+1} for a chow:`;
          this.markWin(results, single[0]+1, Constants.CHOW);
        }
        //else console.log('bad pattern:',single.sort(),pair.sort(),set.sort());
      }
      //else console.log('bad pattern:',single.sort(),pair.sort(),set.sort());
      //if (msg) console.log(msg, single.sort(),pair.sort(),set.sort());
    }
  }
  determineWin(results=[], single=[], pair=[], set=[]) {
    let tile = this.keys[0]|0;
    let count = this.tiles[tile];

    if (count>3) this.recurseForWin([tile, tile, tile, tile], results, single, pair, set.concat([`k${tile}`]));
    if (count>2) this.recurseForWin([tile, tile, tile], results, single, pair, set.concat([`p${tile}`]));
    if (count>1) this.recurseForWin([tile, tile], results, single, pair.concat([tile]), set);
    if (count===1) this.recurseForWin([tile], results, single.concat([tile]), pair, set);

    if (tile > 26) return;
    let {t1, t2} = this.getChowInformation(tile);
    if (t1 && t2) this.recurseForWin([tile, tile+1, tile+2], results, single, pair, set.concat([`c${tile}`]));
    return results;
  }
}

window.tilesNeeded = tiles => {
  let p = new Pattern(tiles);
  let lookout = p.copy().expand();
  let checkwin = p.copy().determineWin();
  checkwin.forEach((l,idx) => lookout[idx] = l);
  return lookout;
};


/*
  let hand = [1,1,3,4,6,12,13,15, 15, 15, 26, 28, 30 ];
  // hand = [1,1,1,6,6,6,9,9,9,14,14,14,27];
  // hand = [1,2,3, 6,6,6, 10,11,12, 26,26,26, 27];
  // hand = [1,2,3, 6,6,6, 10,11,12, 26,26, 27,27];
  // hand = [1,1,1, 1,2,3, 3,3,3, 4,5,6, 7];
  console.log("current hand:", hand);
  console.log("discards we want to be on the lookout for:");
  console.log(tilesNeeded(hand));
*/
