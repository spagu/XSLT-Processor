/**
 * Installation of the XsltEngine method groups.
 *
 * The engine is split by concern into modules that each export a plain
 * object of methods (`this` is the engine). They are installed on
 * `XsltEngine.prototype`, so every method stays callable on the engine under
 * its old name and the instruction dispatch (`this[method](...)`) costs no
 * extra stack frame per recursion level.
 */

/**
 * Define the methods (and accessors) of each group on a prototype, as
 * non-enumerable properties like class methods.
 *
 * @param {object} prototype - The class prototype receiving the methods
 * @param {...object} groups - Objects of methods, getters included
 * @returns {void}
 * @throws {Error} When two groups define the same name
 */
export function installMethods(prototype, ...groups) {
  for (const group of groups) {
    const descriptors = Object.getOwnPropertyDescriptors(group);
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (Object.hasOwn(prototype, name)) {
        throw new Error(`Engine method defined twice: ${name}`);
      }
      Object.defineProperty(prototype, name, {
        ...descriptor,
        enumerable: false,
      });
    }
  }
}
