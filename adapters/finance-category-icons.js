"use strict";

const CATEGORY_ICON_BY_NAME = Object.freeze(new Map([
  ["早餐", "food-breakfast"],
  ["午餐", "food-lunch"],
  ["晚餐", "food-dinner"],
  ["夜宵", "food-dinner"],
  ["餐饮", "food-lunch"],
  ["餐饮其他", "food-lunch"],
  ["小吃", "food-lunch"],
  ["甜品", "food-lunch"],
  ["零食", "food-lunch"],
  ["食物", "food-lunch"],
  ["盒马", "food-lunch"],
  ["全家", "food-lunch"],
  ["买菜", "health-organic"],
  ["买菜原料", "health-organic"],
  ["饮料", "drink-bowl"],
  ["饮料水果", "drink-bowl"],
  ["水", "utility-water"],
  ["牛奶", "drink-milk"],
  ["酒", "drink-bowl"],

  ["交通", "transport"],
  ["交通其他", "transport"],
  ["打车", "transport"],
  ["火车", "transport"],
  ["加油", "transport"],
  ["充电", "utility-power"],
  ["停车费", "parking"],
  ["ETC通行费", "parking"],
  ["过路过桥", "parking"],
  ["保养维修", "transport"],
  ["洗车", "transport"],
  ["车险", "transport"],
  ["车款车贷", "transport"],

  ["居家", "home-house"],
  ["家庭日常", "family-bill"],
  ["家庭支出", "family-bill"],
  ["家庭开销", "family-bill"],
  ["生活其他", "home-supplies"],
  ["生活用品", "home-supplies"],
  ["日用百货", "home-supplies"],
  ["家居百货", "home-supplies"],
  ["材料建材", "home-house"],
  ["软装家具", "home-house"],
  ["物业", "property"],
  ["家政服务", "home-service"],
  ["水电燃气", "utility-power"],
  ["电费", "utility-power"],
  ["水费", "utility-water"],
  ["燃气费", "utility-power"],
  ["话费", "phone-bill"],
  ["手机电话", "phone-bill"],
  ["电脑宽带", "digital-router"],
  ["新风", "home-ventilation"],
  ["大家电", "home-appliance"],
  ["住宿房租", "home-house"],
  ["生活费", "family-bill"],
  ["税费手续费", "tax-fee"],
  ["学习", "software-briefcase"],
  ["英语学习", "software-briefcase"],
  ["快递邮政", "shipping"],

  ["购物", "clothing-shirt"],
  ["购物其他", "clothing-shirt"],
  ["服饰", "clothing-shirt"],
  ["服饰鞋包", "clothing-shirt"],
  ["定制衣服", "clothing-shirt"],
  ["化妆护肤", "health-bottle"],
  ["保健用品", "health-bottle"],
  ["宝宝用品", "home-supplies"],
  ["文具玩具", "home-supplies"],
  ["文具", "home-supplies"],
  ["报刊书籍", "software-briefcase"],
  ["电子数码", "digital-headphone"],
  ["电器", "home-appliance"],
  ["超市", "home-supplies"],
  ["屈臣氏", "health-bottle"],
  ["茶叶", "drink-bowl"],
  ["爱婴室", "home-supplies"],
  ["珠宝首饰", "gift-money"],

  ["医教", "medical-pill"],
  ["医疗", "medical-pill"],
  ["医疗药品", "medical-pill"],
  ["药", "medical-pill"],
  ["挂号门诊", "medical-pill"],
  ["牙科", "medical-dental"],
  ["学费", "software-briefcase"],
  ["正版软件", "software-briefcase"],
  ["养生保健", "health-bottle"],
  ["按摩", "health-bottle"],

  ["人情", "gift-money"],
  ["人情其他", "gift-money"],
  ["孝敬", "gift-money"],
  ["礼金红包", "gift-money"],
  ["小费", "gift-money"],
  ["代付款", "gift-money"],
  ["外援", "gift-money"],
  ["红包", "gift-money"],
  ["微信红包", "gift-money"],
  ["礼金", "gift-money"],

  ["娱乐", "media"],
  ["娱乐其他", "media"],
  ["电影", "media"],
  ["游戏", "media"],
  ["运动健身", "health-bottle"],
  ["旅游度假", "transport"],
  ["旅游", "transport"],
  ["酒店", "home-house"],
  ["机票", "transport"],
  ["援助", "gift-money"],
  ["音像", "media"],
  ["CD", "media"],
  ["声学", "media"],
  ["线材", "digital-headphone"],

  ["投资", "investment"],
  ["投资其他", "investment"],
  ["股票", "investment"],
  ["保险", "investment"],
  ["奢侈品", "gift-money"],
  ["手表", "gift-money"],

  ["工资薪水", "income-salary"],
  ["第二薪酬", "income-salary"],
  ["奖金", "income-bonus"],
  ["退款", "income-refund"],
  ["退款返款", "income-refund"],
  ["利息", "investment"],
  ["分红", "investment"],
  ["租金", "home-house"],
  ["房产出售", "home-house"],
  ["奢侈品出售", "gift-money"],
  ["光伏", "utility-power"],
  ["其他", "category-generic"],
]));

function clean(value) {
  return String(value || "").trim();
}

function splitCategoryPath(path) {
  return clean(path).split("/").map((part) => part.trim()).filter(Boolean);
}

function categoryIconForPath(categoryPath, type = "") {
  const parts = splitCategoryPath(categoryPath);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const name = parts[index];
    if (CATEGORY_ICON_BY_NAME.has(name)) return CATEGORY_ICON_BY_NAME.get(name);
  }
  if (type === "income") return "income-salary";
  return "category-generic";
}

module.exports = {
  CATEGORY_ICON_BY_NAME,
  categoryIconForPath,
  splitCategoryPath,
};
