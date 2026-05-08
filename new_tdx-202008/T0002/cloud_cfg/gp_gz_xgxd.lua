--新高/新低周期数排序规则
function sortperiod(a, b)
	if a == "历史新高" then
		a = 9999
	elseif a == "历史新低" then
		a = -9999
	end
	
	if b == "历史新高" then
		b = 9999
	elseif b == "历史新低" then
		b = -9999
	end
	
	local num1 = tonumber(a)
	local num2 = tonumber(b)
	if num1 < num2 then
		return -1
	elseif num1 == num2 then
		return 0
	else
		return 1
	end
end