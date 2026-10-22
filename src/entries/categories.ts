/*
  What a ₱ line was for. Food has sub-categories; a sub-category is stored by
  its own name ("Groceries"), so a choice saved before Food had them still
  reads as Food › Groceries. Pure: hand-written keywords, then your choice for
  the line's merchant or first word, which wins.
*/

export const FOOD_SUBS = ['Groceries', 'Eating out', 'Coffee/snacks', 'Delivery'] as const
export const CATEGORIES = ['Food', ...FOOD_SUBS, 'Transport', 'Bills & load', 'School', 'Shopping', 'Health', 'Fitness', 'Fun', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

/** "Eating out" → "Food"; a top-level category is itself. */
export const topCategory = (c: string): string => ((FOOD_SUBS as readonly string[]).includes(c) ? 'Food' : c)

/** "Food › Eating out", or the category itself. */
export const categoryLabel = (c: string): string => (topCategory(c) === c ? c : `${topCategory(c)} › ${c}`)

const words = (list: string): RegExp => new RegExp(`(?:^|[^\\p{L}])(?:${list.split(' ').map((w) => w.replace(/_/g, ' ')).join('|')})(?![\\p{L}])`, 'iu')

// The most specific first: "padeliver ng milktea" is Delivery, "lunch sa jollibee" is Eating out
const RULES: Array<[Category, RegExp]> = [
  ['Delivery', words('grab_?food foodpanda food_panda pa-?deliver padeliver delivery deliver')],
  ['Groceries', words('grocery groceries palengke supermarket puregold savemore landers walter_?mart')],
  ['Eating out', words('jollibee mcdo mcdonalds chowking mang_inasal inasal kfc greenwich shakeys pizza burger resto restaurant karinderya carinderia samgyup samgyupsal silog tapsilog bonchon kainan eat_out ate_out dine_out')],
  ['Coffee/snacks', words('kape coffee starbucks sbux latte frappe milktea milk_tea snack snacks siomai fishball chichirya chips ice_cream 7-eleven 711 dunkin')],
  ['Food', words('food lunch dinner breakfast almusal tanghalian hapunan merienda meryenda kain ulam rice kanin drinks bread pandesal')],
  ['Transport', words('jeep jeepney bus mrt lrt grab angkas joyride moveit tricycle trike taxi pamasahe fare gas gasolina parking toll ferry uv')],
  ['Bills & load', words('load data globe smart dito tm gomo meralco kuryente electric tubig internet wifi pldt converge netflix spotify youtube rent upa bills bill')],
  ['School', words('tuition print printing xerox photocopy book books school project supplies notebook pen ballpen')],
  ['Shopping', words('shopee lazada shein clothes damit shoes sapatos')],
  ['Health', words('medicine gamot meds doctor checkup dentist vitamins pharmacy mercury clinic hospital')],
  ['Fitness', words('gym day_pass membership protein whey creatine zumba yoga')],
  ['Fun', words('movie movies sine games game gift regalo date gala')],
]

/**
 * A line's category, or undefined when nothing says: your choice for its
 * merchant (`key`) or first word, else the first keyword rule it matches.
 */
export function findCategory(text: string, chosen: Record<string, string>, key?: string): string | undefined {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return (key && chosen[key]) || chosen[first] || RULES.find(([, re]) => re.test(text))?.[0]
}

/** A line's category: your choice, else Tala's guess, else Other. */
export const categoryOf = (text: string, chosen: Record<string, string>, key?: string): string => findCategory(text, chosen, key) ?? 'Other'
