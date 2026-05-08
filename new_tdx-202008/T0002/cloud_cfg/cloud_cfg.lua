--当行情名称为空时，返回默认配置名称
function getdefmc(code, market, zqjc)
	if zqjc == "" then
		if code == "899050" and market == "2" then
			return "上证50"
		elseif code == "000983" and market == "62" then
			return "智能资产"
		elseif code == "399817" and market == "0" then
			return "生态100"
		else
			return ""
		end
	else
		return zqjc
	end
end