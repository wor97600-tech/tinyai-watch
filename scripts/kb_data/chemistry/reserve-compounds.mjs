const compounds = [
  ['sodium-chloride','氯化钠','NaCl','钠、氯','常用作食盐的主要成分，也用于食品调味；纯品是离子化合物。'],
  ['carbon-dioxide','二氧化碳','CO₂','碳、氧','植物光合作用会利用它，固态二氧化碳俗称干冰，可用于制冷。'],
  ['ammonia','氨','NH₃','氮、氢','是重要的含氮化工原料，易溶于水，水溶液呈碱性。'],
  ['methane','甲烷','CH₄','碳、氢','是天然气的主要成分之一，可燃烧放热，燃烧需保证通风。'],
  ['ethanol','乙醇','C₂H₅OH','碳、氢、氧','常用作溶剂和燃料添加成分，也存在于酒类饮品中。'],
  ['glucose','葡萄糖','C₆H₁₂O₆','碳、氢、氧','是重要单糖，细胞可通过呼吸作用分解它并释放可利用的能量。'],
  ['sucrose','蔗糖','C₁₂H₂₂O₁₁','碳、氢、氧','是常见双糖，由葡萄糖和果糖单元构成，甘蔗和甜菜中含量较多。'],
  ['calcium-carbonate','碳酸钙','CaCO₃','钙、碳、氧','是石灰石和大理石的主要成分，遇酸会放出二氧化碳气体。'],
  ['sodium-bicarbonate','碳酸氢钠','NaHCO₃','钠、氢、碳、氧','俗称小苏打，受热或遇酸可放出二氧化碳，常用于烘焙膨松。'],
  ['sulfuric-acid','硫酸','H₂SO₄','氢、硫、氧','是重要的强酸和化工原料；浓硫酸有强腐蚀性，须由专业人员规范操作。'],
  ['hydrochloric-acid','盐酸','HCl','氢、氯','是氯化氢的水溶液，胃液中含少量盐酸，实验室使用需注意腐蚀性。'],
  ['nitric-acid','硝酸','HNO₃','氢、氮、氧','是常见强酸和含氮化工原料，具有腐蚀性，不能随意接触或混用。'],
  ['sodium-hydroxide','氢氧化钠','NaOH','钠、氧、氢','俗称烧碱或苛性钠，是强碱并有腐蚀性，溶于水时会放出热量。'],
  ['calcium-hydroxide','氢氧化钙','Ca(OH)₂','钙、氧、氢','俗称熟石灰，水溶液可用于检验二氧化碳，建筑材料中也常见。'],
  ['calcium-oxide','氧化钙','CaO','钙、氧','俗称生石灰，与水反应生成氢氧化钙并放热，常用于工业制备熟石灰。'],
  ['iron-oxide','氧化铁','Fe₂O₃','铁、氧','是常见铁氧化物，也是铁锈的主要成分之一，可作为炼铁原料。'],
  ['copper-oxide','氧化铜','CuO','铜、氧','是一种黑色固体，受热可与某些还原剂反应生成铜。'],
  ['sulfur-dioxide','二氧化硫','SO₂','硫、氧','由硫燃烧可生成，过量排放会造成空气污染并参与酸雨形成。'],
  ['sulfur-trioxide','三氧化硫','SO₃','硫、氧','可与水反应生成硫酸，是硫酸工业中的重要中间物质。'],
  ['carbon-monoxide','一氧化碳','CO','碳、氧','是无色无味的有毒气体，会影响血液运输氧气，需防范不完全燃烧。'],
  ['nitric-oxide','一氧化氮','NO','氮、氧','在空气中容易进一步氧化为二氧化氮，也会参与生物体内的信号调节。'],
  ['nitrogen-dioxide','二氧化氮','NO₂','氮、氧','是红棕色刺激性气体，空气污染中可见其参与臭氧和硝酸盐生成过程。'],
  ['ozone','臭氧','O₃','氧','平流层臭氧能吸收部分紫外线；近地面臭氧过量则会刺激呼吸道。'],
  ['hydrogen-peroxide','过氧化氢','H₂O₂','氢、氧','俗称双氧水，容易分解成水和氧气；使用浓度和用途须遵循产品说明。'],
  ['hydrogen-sulfide','硫化氢','H₂S','氢、硫','是有毒且有臭鸡蛋气味的气体，高浓度会迅速削弱嗅觉，不能靠气味判断安全。'],
  ['copper-sulfate','硫酸铜','CuSO₄','铜、硫、氧','无水硫酸铜是白色固体，吸水后变蓝，可用于演示水的检验。'],
  ['potassium-nitrate','硝酸钾','KNO₃','钾、氮、氧','是常见硝酸盐，可用作化肥原料；具体用途须遵循安全与法规要求。'],
  ['calcium-phosphate','磷酸钙','Ca₃(PO₄)₂','钙、磷、氧','是骨骼和牙齿矿物质的重要组成类型，也广泛存在于磷矿中。'],
  ['calcium-chloride','氯化钙','CaCl₂','钙、氯','容易吸收水分，可作干燥剂或融雪材料；无水品遇水会放出热量。'],
  ['sodium-carbonate','碳酸钠','Na₂CO₃','钠、碳、氧','俗称纯碱或苏打，是玻璃、洗涤剂和化工生产中的常见原料。'],
  ['ammonium-chloride','氯化铵','NH₄Cl','氮、氢、氯','是常见铵盐，可作化肥原料；加热时会发生可逆分解与重组。'],
  ['potassium-chloride','氯化钾','KCl','钾、氯','是重要钾盐和钾肥原料，也用于实验室配制含钾溶液。'],
  ['potassium-chlorate','氯酸钾','KClO₃','钾、氯、氧','受热可分解释放氧气，具有助燃性，储存和实验须由专业人员规范管理。'],
  ['potassium-permanganate','高锰酸钾','KMnO₄','钾、锰、氧','是紫黑色氧化剂，水溶液呈紫色；实验中不可与不相容物质随意混合。'],
  ['acetic-acid','乙酸','CH₃COOH','碳、氢、氧','俗称醋酸，是食醋酸味的主要来源，也是重要的有机化工原料。'],
  ['benzene','苯','C₆H₆','碳、氢','是具有环状结构的芳香烃，易燃且有健康危害，工业操作需严格防护。'],
  ['methanol','甲醇','CH₃OH','碳、氢、氧','是结构最简单的醇，具有毒性且易燃，不能饮用或用作食品原料。'],
  ['acetone','丙酮','C₃H₆O','碳、氢、氧','是常用有机溶剂，挥发性和可燃性较强，使用时需远离火源并保持通风。'],
  ['glycerol','甘油','C₃H₈O₃','碳、氢、氧','是一种有吸湿性的三元醇，可用于化妆品、食品和药品配方。'],
  ['citric-acid','柠檬酸','C₆H₈O₇','碳、氢、氧','广泛存在于柑橘类水果中，可作食品酸味剂，也能与金属离子结合。'],
  ['lactic-acid','乳酸','C₃H₆O₃','碳、氢、氧','是人体无氧糖酵解过程的产物之一，也由乳酸菌发酵生成。'],
  ['urea','尿素','CH₄N₂O','碳、氢、氮、氧','是含氮量较高的化肥原料，也是在哺乳动物体内形成并排出的含氮废物。'],
  ['quartz','石英','SiO₂','硅、氧','是常见矿物，具有晶体结构和较高硬度，纯净石英可用于制造玻璃和光学材料。'],
  ['manganese-dioxide','二氧化锰','MnO₂','锰、氧','常作化学反应的催化剂或电池材料，也用于玻璃和陶瓷工业。'],
  ['silver-chloride','氯化银','AgCl','银、氯','是白色难溶盐，见光会逐渐分解变暗，曾用于传统摄影材料。'],
  ['silver-nitrate','硝酸银','AgNO₃','银、氮、氧','是可溶性银盐，见光易分解，实验操作需避免接触皮肤并妥善保存。'],
  ['aluminium-oxide','氧化铝','Al₂O₃','铝、氧','是铝土矿的重要成分，熔点高且硬度大，也用于耐火材料和陶瓷。'],
  ['magnesium-chloride','氯化镁','MgCl₂','镁、氯','是常见镁盐，海水和盐湖中可见其离子，工业上可用于制取金属镁。'],
  ['magnesium-oxide','氧化镁','MgO','镁、氧','具有较高熔点，可用于耐火材料、陶瓷和一些电气绝缘制品。'],
  ['zinc-oxide','氧化锌','ZnO','锌、氧','可用于橡胶、陶瓷和防晒产品配方，具体用途取决于颗粒与产品设计。'],
  ['lead-dioxide','二氧化铅','PbO₂','铅、氧','是铅酸蓄电池正极活性材料之一，具有氧化性且含铅材料需规范回收。'],
  ['hydrogen-gas','氢气','H₂','氢','是最轻的气体，燃烧生成水；它易燃，储存和使用需要专门安全设施。'],
  ['oxygen-gas','氧气','O₂','氧','约占干燥空气体积的五分之一，能支持燃烧，但本身不是可燃物。'],
  ['nitrogen-gas','氮气','N₂','氮','约占干燥空气体积的五分之四，化学性质较稳定，工业上常作保护气体。'],
  ['chlorine-gas','氯气','Cl₂','氯','是黄绿色有毒气体，能与水反应并用于工业消毒，须在严格防护下处理。'],
  ['fluorine-gas','氟气','F₂','氟','是极活泼的淡黄色气体，反应性极强，只能由专业设施安全制取和管理。'],
  ['phosphoric-acid','磷酸','H₃PO₄','氢、磷、氧','是常见含磷酸类，可用于食品工业和化肥生产，浓溶液具有刺激性。'],
  ['boric-acid','硼酸','H₃BO₃','氢、硼、氧','是弱酸性硼化合物，可用于玻璃和搪瓷工业；用途应遵循产品规定。'],
  ['sodium-hypochlorite','次氯酸钠','NaClO','钠、氯、氧','是含氯消毒产品中的有效成分之一，不能与酸性清洁剂混用以免产生有害气体。'],
  ['sodium-fluoride','氟化钠','NaF','钠、氟','是常见氟化物，少量可用于部分口腔护理产品，摄入过量会造成健康风险。'],
  ['calcium-sulfate','硫酸钙','CaSO₄','钙、硫、氧','石膏的主要成分为含结晶水的硫酸钙，常用于建筑、模具和医疗固定材料。'],
  ['sodium-sulfate','硫酸钠','Na₂SO₄','钠、硫、氧','是常见无机盐，可用于玻璃、造纸和洗涤剂工业。'],
  ['potassium-iodide','碘化钾','KI','钾、碘','是常见碘盐，可作化学试剂；药用或营养用途须按专业指导使用。'],
  ['sodium-nitrate','硝酸钠','NaNO₃','钠、氮、氧','是常见硝酸盐，可用作化工原料和肥料成分，具有氧化性。'],
  ['calcium-carbide','碳化钙','CaC₂','钙、碳','与水反应会生成乙炔并放热，工业上用于乙炔制备，必须防潮存放。'],
  ['silicon-carbide','碳化硅','SiC','硅、碳','硬度很高且耐高温，可用于磨料、耐火材料和功率半导体器件。'],
  ['sodium-silicate','硅酸钠','Na₂SiO₃','钠、硅、氧','水溶液俗称水玻璃，可作粘结剂、防腐材料和某些洗涤剂原料。'],
  ['calcium-hypochlorite','次氯酸钙','Ca(ClO)₂','钙、氯、氧','是含氯消毒剂的一类有效成分，须按产品标签稀释并避免与酸混合。'],
]
const rows=[]
const subscriptDigits = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9' }
const formulaQuestions = [
  (n,f)=>`${n}的化学式`, (n,f)=>`怎么写${n}的式子`, (n,f)=>`${n}的化学式是啥`,
  (n,f)=>`${f}是哪种物质`, (n,f)=>`怎样表示${n}`, (n,f)=>`${n}用什么符号表示`,
  (n,f)=>`问${n}的化学式`, (n,f)=>`从式子认${n}`, (n,f)=>`${n}化学式记作啥`,
  (n,f)=>`${n}由何式表示`, (n,f)=>`${n}化学符号怎样写`, (n,f)=>`${f}指什么`,
  (n,f)=>`${n}的组成式`, (n,f)=>`化学式${f}代表啥`, (n,f)=>`${n}用式子怎样写`,
]
const elementQuestions = [
  (n,f)=>`${n}的组成元素`, (n,f)=>`${n}包含哪些元素`, (n,f)=>`什么元素构成${n}`,
  (n,f)=>`${n}有几类原子`, (n,f)=>`${n}元素种类`, (n,f)=>`${n}由哪些原子组成`,
  (n,f)=>`怎样看${n}的组成`, (n,f)=>`${n}含几种元素`, (n,f)=>`${n}是哪些元素的化合物`,
  (n,f)=>`组成${n}的元素是啥`, (n,f)=>`${n}包含哪些原子`, (n,f)=>`${f}里有哪些元素`,
  (n,f)=>`${n}由何元素构成`, (n,f)=>`${n}原子如何构成`, (n,f)=>`${n}的元素构成`,
]
const useQuestions = [
  (n,f)=>`${n}常用来做什么`, (n,f)=>`${n}有什么用途`, (n,f)=>`${n}一般用在哪`,
  (n,f)=>`哪些场景会用到${n}`, (n,f)=>`${n}主要用于何处`, (n,f)=>`${n}有何应用`,
  (n,f)=>`${n}在生活中作什么`, (n,f)=>`为什么会使用${n}`, (n,f)=>`${n}常见作用`,
  (n,f)=>`${n}用在哪里`, (n,f)=>`哪里能见到${n}`, (n,f)=>`${n}的实际用途`,
  (n,f)=>`${n}可以做什么`, (n,f)=>`${n}通常用于何处`, (n,f)=>`${n}对应哪些用途`,
]
const questionOverrides = {
  'oxygen-gas-use': '氧气能支持燃烧吗',
  'ethanol-use': '乙醇在生活中作什么',
  'acetic-acid-use': '乙酸常见在哪些物品',
  'hydrochloric-acid-formula': 'HCl是什么酸',
  'hydrochloric-acid-elements': '盐酸的元素种类',
  'nitric-acid-formula': '硝酸分子式记什么',
  'phosphoric-acid-formula': '磷酸怎样写成式子',
  'phosphoric-acid-elements': '磷酸包含哪些原子',
}
function chooseQuestion(templates, name, formula, index, stride) {
  for (let offset = 0; offset < templates.length; offset++) {
    const question = templates[(index * stride + offset) % templates.length](name, formula)
    const length = [...question].length
    if (length >= 4 && length <= 12) return question
  }
  throw new Error('No short question template for ' + name)
}
for(let i=0;i<compounds.length;i++){
  const [slug,name,formula,elements,use]=compounds[i]
  const plainFormula = formula.replace(/[₀-₉]/g, digit => subscriptDigits[digit])
  rows.push(
    [`compound-${slug}-formula`,(questionOverrides[slug + '-formula'] || chooseQuestion(formulaQuestions,name,plainFormula,i,7)),`${name}的化学式是${plainFormula}，可表示组成它的元素种类及原子个数比例，离子化合物按化学式单位理解。`,`${name}化学式`,plainFormula,`${name}分子式`],
    [`compound-${slug}-elements`,(questionOverrides[slug + '-elements'] || chooseQuestion(elementQuestions,name,plainFormula,i,11)),`${name}由${elements}组成；化学式中的元素符号和下标共同表示其组成比例。`,`${name}元素组成`,elements,plainFormula],
    [`compound-${slug}-use`,(questionOverrides[slug + '-use'] || chooseQuestion(useQuestions,name,plainFormula,i,13)),use,`${name}用途`,plainFormula,`${name}化学常识`],
  )
}
export default { domain: 'chemistry', rows }
