/**
 * This guy should be obvious: bots are simply
 * automated processes that follow play rules
 * and simply do what the code says to do.
 */
class BotPlayer extends Player {
  constructor(id) {
    super(id);
  }

  showTilesAnyway() {
    if (!config.FORCE_OPEN_BOT_PLAY) return;

    // HACK: this function only exists to allow bot play debugging.
    if (window.PLAYER_BANKS && this.id !== 0) {
      let bank = window.PLAYER_BANKS[this.id];
      bank.innerHTML = '';

      this.getTileFaces().forEach(t => {
        t = create(t);
        bank.appendChild(t);
      })

      this.locked.forEach((s,sid) => {
        s.forEach(t => {
          t = create(t.dataset.tile);
          t.dataset.locked = 'locked';
          t.dataset.locknum = sid;
          bank.appendChild(t);
        });
      })

      this.bonus.forEach(t => {
        t = create(t);
        t.dataset.locked = 'locked';
        t.dataset.bonus = 'bonus';
        bank.appendChild(t);
      });

      window.PLAYER_BANKS.sortTiles(bank);
    }
  }

  append(tile, claimed) {
    let _ = super.append(tile, claimed);
    this.showTilesAnyway();
    return _;
  }

  remove(tile) {
    super.remove(tile);
    this.showTilesAnyway();
  }

  /**
   * This is the override for the function that Player calls in order
   * to determine which tile to remove from the hand. The `resolve` function
   * is a promise callback that will allow the game to "unpause" itself.
   *
   * Bot discards are based on what can be meaningfully formed with the
   * tiles currently in hand, and throwing out the tile that contributes
   * the least. Tile availability based on the bot's local knowledge of
   * which tiles might still be available in the game is used to determine
   * whether things like pairs or chows can still be formed.
   *
   * Additionally, the tile value is balanced against its score potential.
   * For example, in a one-suit hand that also has a set of a second suit,
   * the potential payoff for getting rid of that already formed set may
   * outweigh the fact that the tiles involved are already contributing
   * to winning the hand.
   *
   * Note: returning an falsey value leads to the game understanding that
   * as meaning this play has won.
   */
  determineDiscard(resolve) {
    // If we were awarded a winning claim, then by the
    // time we are asked to discard, we will already be
    // marked as having won:
    if (this.has_won) return resolve(undefined);

    // we only consider tiles that we can legally play with, meaning
    // (obvious) not bonus tiles, and not any tile already involved
    // in a play-claim earlier.
    let tiles = this.getAvailableTiles();

    // if we have no concealed tiles, that means it became our turn by
    // declaring a win off of a discard. So... don't discard!
    if (!tiles.length) return resolve(undefined);

    // If we have concealed tiles still, did the tile we just received
    // actually make us win?
    let {lookout, waiting, composed, winpaths} = tilesNeeded(this.getTileFaces(), this.locked);

    if(winpaths > 0) {
      // We have indeed won! Mark this as a self-drawn win, because
      // if it was a claimed win we would have exited this function
      // already, and then let the play.js game loop discover we've
      // won by not discarding anything.
      if (!this.latest.dataset.from) {
        this.selfdraw = true;
        console.log(`Self-drawn win for player ${this.id} on ${this.latest.dataset.tile}`);
      } else {
        // FIXME: the fact that we can get here means that we performed
        //        a claim that we didn't think was a win, but it _was_
        //        so that's a bug in determineClaim and the following
        //        code should not be necessary when that's fixed:
        this.locked.slice(-1)[0].winning = true;
      }
      return resolve(undefined);
    }

    // Now then. We haven't won, let's figure out which tiles are worth keeping,
    // and which tiles are worth throwing away.
    this.determineDiscardUsingTracker(resolve);
  }

  /**
   * This is the second part of determineDiscard, which handles all
   * the "we didn't just win" cases.
   */
  determineDiscardUsingTracker(resolve) {
    let tiles = this.getAvailableTiles();
    let tileCount = [];
    let immediateValue = [];
    let potentialValue = [];

    // First, let's see how many of each tile we have.
    let faces = Array.from(tiles).map(tile => {
      let id = tile.getTileFace();
      if (!tileCount[id]) { tileCount[id] = 0; }
      tileCount[id]++;
      return id;
    });

    // Cool. With that sorted out, let's start ranking
    // tiles in terms of how valuable they are to us.
    faces.forEach( tile => {
      let value = 0;
      let availability = this.tracker.get(tile);

      // values are based on "can we get more". If not, then
      // however many tile we have is all we'll get.

      if (tileCount[tile] >= 3) value = max(value, availability>0 ? 100 : 90);
      else if (tileCount[tile] === 2) value = max(value, availability>0 ? 90 : 50);
      else if (tileCount[tile] === 1) {
        if (tile < 27) value = max(value, this.determineDiscardValueForChow(value, tile, tileCount));
        value = max(value, availability ? 40 : 0);
      }

      // Record the (by definition) highest value for this tile.
      immediateValue[tile] = value;

      // Now that we know the basic values of each tile: what are the
      // potential ramifications of discarding each? Specifically,
      // we're interested in whether we can change our pontential
      // score.
      potentialValue[tile] = this.calculatePotentialScoreDifference(tile, tiles);
    });


    // We will find the lowest scoring tile, and discard that one
    let tile = 0;
    let l = Number.MAX_VALUE;
    immediateValue
      .map((v,tile) => this.balanceDiscardMetrics(v, potentialValue[tile]))
      .forEach((value,pos) => { if (value < l) { l = value; tile = pos; }});

    resolve(this.getSingleTileFromHand(tile));
  }

  /**
   * determineDiscard helper function dedicated to determining
   * whether chows are an option or not.
   */
  determineDiscardValueForChow(value, tile, tileCount) {
    let face = tile % 9;
    let m2 = tileCount[tile - 2] > 0;
    let m1 = tileCount[tile - 1] > 0;
    let p1 = tileCount[tile + 1] > 0;
    let p2 = tileCount[tile + 2] > 0;
    let m2a = this.tracker.get(tile - 2) > 0;
    let m1a = this.tracker.get(tile - 1) > 0;
    let p1a = this.tracker.get(tile + 1) > 0;
    let p2a = this.tracker.get(tile + 2) > 0;

    // X?? chow check
    if (face<7) {
      if (p1 && p2) value = max(value, 90) // already in hand
      else if (p1 && p2a) value = max(value, 80) // possible
      else if (p1a && p2) value = max(value, 70) // possible (gap)
    }

    // ?X? chow check
    if (face>0 && face<8) {
      if (m1 && p1) value = max(value, 90) // already in hand
      else if (m1 && p1a) value = max(value, 80) // possible
      else if (m1a && p1) value = max(value, 80) // possible
    }

    // ??X chow check
    if (face>1) {
      if (m2 && m1) value = max(value, 90) // already in hand
      else if (m2 && m1a) value = max(value, 70) // possible (gap)
      else if (m2a && m1) value = max(value, 80) // possible
    }

    return value;
  }

  /**
   * This is the third part of the determineDiscard logic,
   * which checks whether there is a marked increase in score
   * to be had by discarding a particular tile. On its own,
   * this would be a terrible game strategy, but by balancing
   * the outcome against the base value in the hand, this
   * allows bots to strategise.
   */
  calculatePotentialScoreDifference(tile, tiles) {

    /*
     - consider this tile + all tiles in its suit
     - consider this tile + any tiles that it might form a chow with
     - etc.
     - how far ahead should bots look?
    */

    // ... code goes here...
    return 0;
  }

  /**
   * This function performs the balacing of immediate value
   * of a tile in a hand vs. the potential increase in value
   * of the hand on the whole if we discard this tile.
   */
  balanceDiscardMetrics(immediate, potential) {
    // ... code goes here...
    return immediate + potential;
  }


  /**
   * Automated claim policy, see `tilesNeeded` in `./mgen.js`
   */
  async determineClaim(pid, discard, resolve, interrupt) {
    // which tile is this?
    let tile = discard.getTileFace();

    // build a quick list of what we might actually be interested in
    let canChow = ((pid+1)%4 == this.id);

    let tiles = this.getTileFaces();
    tiles.sort();

    Logger.debug(`${this.id} determining claim for ${tile} based on ${tiles}`);

    let {lookout, waiting, composed} = tilesNeeded(tiles, this.locked, canChow);
    this.markWaiting(waiting);

    Logger.debug(lookout);
    Logger.debug(composed);

    // is the current discard in the list of tiles we want?
    let claim = CLAIM.IGNORE, wintype;
    if (lookout[tile]) {
      lookout[tile].map(print => unhash(print,tile)).forEach(set => {
        let type = set.type;
        if (type === Constants.PAIR) return;
        if (type === Constants.CHOW) {
          if ((pid+1)%4 != this.id) return;
          type = convertSubtypeToClaim(set.subtype);
        }
        if (type === CLAIM.WIN) {
          wintype = set.subtype ? set.subtype : 'normal';
        }
        if (type > claim) {
          claim = type;
        }
      });
      return resolve({claimtype: claim, wintype});
    }

    return resolve({claimtype: CLAIM.IGNORE});
  }
}
