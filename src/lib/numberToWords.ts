// Converts PKR amounts to English words, supports up to crores

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertBelow1000(n: number): string {
  if (n === 0) return ''
  const parts: string[] = []
  const h = Math.floor(n / 100)
  if (h > 0) parts.push(ones[h] + ' Hundred')
  const r = n % 100
  if (r > 0) {
    if (r < 20) parts.push(ones[r])
    else parts.push(tens[Math.floor(r / 10)] + (r % 10 > 0 ? ' ' + ones[r % 10] : ''))
  }
  return parts.join(' ')
}

export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero'
  if (amount < 0) return 'Minus ' + numberToWords(Math.abs(amount))

  const num = Math.round(amount * 100) // work in paisa
  const rupees = Math.floor(num / 100)
  const paisa = num % 100

  const parts: string[] = []

  if (rupees > 0) {
    // Indian numbering: crores, lakhs, thousands, hundreds
    const crore = Math.floor(rupees / 10000000)
    const lakh = Math.floor((rupees % 10000000) / 100000)
    const thousand = Math.floor((rupees % 100000) / 1000)
    const hundred = rupees % 1000

    if (crore > 0) parts.push(convertBelow1000(crore) + ' Crore')
    if (lakh > 0) parts.push(convertBelow1000(lakh) + ' Lakh')
    if (thousand > 0) parts.push(convertBelow1000(thousand) + ' Thousand')
    if (hundred > 0) parts.push(convertBelow1000(hundred))
  }

  const word = parts.join(' ')
  const result = word ? word + ' Rupees' : ''

  if (paisa > 0) {
    return result + ' and ' + convertBelow1000(paisa) + ' Paisa Only'
  }
  return result + ' Only'
}
