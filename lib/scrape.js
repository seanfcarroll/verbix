var R = require('ramda')
var domFromHtml = require('./parse')

var AllHtmlEntities = require('html-entities').AllHtmlEntities
var entities = new AllHtmlEntities()

var getChildren = R.propOr([], 'children')

var extractTitle = R.pipe(
  getChildren,
  R.find(
    R.pipe(
      R.propOr('', 'name'),
      R.contains(R.__, ['h1', 'h2', 'h3'])
    )
  ),
  getChildren,
  R.find(R.propEq('type', 'text')),
  R.propOr('', 'data'),
  function (t) {
    return t.replace(/\s+/g, '_')
  },
  R.toLower
)

// recursive search of element array
var recursiveElSearch = R.curry(function (predicate, elements) {
  return R.pipe(
    R.map(
      R.cond([
        [predicate, R.identity],
        [R.T, R.pipe(
          getChildren,
          recursiveElSearch(predicate)
        )]
      ])
    ),
    R.unnest
  )(elements)
})

// Given an array of dom elements, find spans recursively
var getSpans = recursiveElSearch(R.propEq('name', 'span'))

// https://github.com/ramda/ramda/issues/1515
var splitOn = R.curry(function (predicate, arr) {
  return R.reduce(function (acc, val) {
    return predicate(val)
      ? R.concat(acc, [[]])
      : R.concat(
        R.init(acc),
        [R.concat(R.last(acc), [val])]
      )
  }, [[]], arr)
})

var extractTextFromSpan = R.pipe(
  getChildren,
  // A text element is the span's only child
  R.head,
  R.propOr('', 'data'),
  entities.decode,
  R.trim
)

var summarizeTenseTable = function (el) {
  var getPronounConjugationMap = R.pipe(
    getChildren,
    // The rows are enclosed in a <p></p>
    R.find(R.propEq('name', 'p')),
    getChildren,
    // The rows are separated by brs
    // returns a list of lists (rows)
    splitOn(R.propEq('name', 'br')),
    // From list of lists of elements to
    // list of lists of spans
    R.map(getSpans),
    // Split each row into sets of article and conjugation elements
    R.map(R.partition(R.pipe(
      R.prop('parent'),
      R.prop('name'),
      R.equals('font')
    ))),
    R.map(R.map(R.map(extractTextFromSpan))),
    R.map(R.pipe(
      function (row) {
        var articles = row[0]
        var conjugations = row[1]
        return R.map(function (article) {
          return [article, conjugations]
        })(articles)
      }
    )),
    R.unnest,
    // A row must have at least two elements
    R.filter(R.pipe(R.length, R.gte(R.__, 2))),
    R.fromPairs
  )

  return R.assoc(extractTitle(el), getPronounConjugationMap(el), {})
}

var moodElPredicate = R.pipe(
  R.path(['attribs', 'class']),
  // Totally magic string
  R.equals('pure-u-1-1 pure-u-lg-1-2')
)

var tenseElPredicate = R.pipe(
  R.path(['attribs', 'class']),
  // Totally magic string
  R.equals('pure-u-1-2')
)

var summarizeMoodTable = function (el) {
  var getTenseTables = R.pipe(
    getChildren,
    recursiveElSearch(tenseElPredicate)
  )

  var summarizeTenseTables = R.pipe(
    getTenseTables,
    R.map(summarizeTenseTable),
    R.reduce(R.merge, {})
  )

  return R.assoc(
    extractTitle(el),
    summarizeTenseTables(el),
    {}
  )
}

var summarizePage = R.pipe(
  recursiveElSearch(moodElPredicate),
  R.map(summarizeMoodTable),
  R.reduce(R.merge, {})
)

module.exports = R.pipeP(
  domFromHtml,
  summarizePage
)
