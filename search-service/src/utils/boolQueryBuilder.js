/**
 * Builder pattern for Elasticsearch `bool` queries.
 *
 * Search filters are optional (category? fuel? max price? dates?). Instead of a
 * pile of `if (x) filter.push({...})`, each builder step simply ignores an empty
 * value, so the query reads as one chain and build() returns the final object.
 *
 *   filter   → must match, not scored (fast, cacheable)
 *   must_not → must NOT match (e.g. cars with a booking overlapping the dates)
 */
const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => !isEmpty(v)));

class BoolQueryBuilder {
     constructor() {
          this.filters = [];
          this.exclusions = [];
     }

     /** field == value */
     term(field, value) {
          if (!isEmpty(value)) this.filters.push({ term: { [field]: value } });
          return this;
     }

     /** field is one of values */
     terms(field, values) {
          if (!isEmpty(values)) this.filters.push({ terms: { [field]: values } });
          return this;
     }

     /** field within bounds, e.g. { gte: 4 } — empty bounds are dropped */
     range(field, bounds) {
          const clean = compact(bounds);
          if (Object.keys(clean).length) this.filters.push({ range: { [field]: clean } });
          return this;
     }

     /** A nested-object condition (e.g. "one of the trip's stops is in this city") */
     nested(path, query, innerHitsName) {
          this.filters.push({
               nested: { path, query, ...(innerHitsName && { inner_hits: { name: innerHitsName, size: 10 } }) },
          });
          return this;
     }

     /** Exclude documents whose range field intersects bounds */
     excludeRange(field, bounds) {
          const clean = compact(bounds);
          if (Object.keys(clean).length) this.exclusions.push({ range: { [field]: clean } });
          return this;
     }

     build() {
          return {
               bool: {
                    filter: this.filters,
                    ...(this.exclusions.length && { must_not: this.exclusions }),
               },
          };
     }
}

module.exports = { BoolQueryBuilder };
