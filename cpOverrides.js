/**
 * Manually pinned catch CP.
 *
 * Catch CP is normally *derived* from current Pokémon GO base stats, so it can
 * never go stale — see data.js. This map exists only for cases the stat data
 * cannot express on its own, and it is checked before anything else.
 *
 * Add an entry when, and only when, the derived value is wrong for a reason a
 * human has to judge. The known category is **which form you actually catch**:
 * Zacian's base stats resolve to Crowned Sword, but raids give Hero of Many
 * Battles. That particular case is now handled generically by CATCHABLE_FORMS
 * in parse.js, which is the better fix whenever the rule generalises.
 *
 * Prefer fixing the derivation over adding an override. An override is a value
 * nothing will ever re-check — exactly the staleness this file replaced.
 *
 * Format matches the derived shape:
 *
 *   "Some Pokémon": { hundo: 1234, whundo: 1543 },   // why, and when checked
 *
 * hundo  = level 20 catch (standard raid), 15/15/15
 * whundo = level 25 catch (weather boosted), 15/15/15
 */
export const cpOverrides = {
    // Empty by design. Every name the tool has ever needed currently resolves
    // from base stats, including form-qualified ones like "Deoxys Attack" and
    // "Giratina (Origin)".
};
