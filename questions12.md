3. does it make sense to have both __gate and __prep for branch? would it be better to just put JSON condition on the branch's __prep? why not?

im not sure if the __prep for step should be step::__prep - the '::' operator is only for prefixing the branch slugs
so your per-step fanout prep would be imo branchPath::__prep__step
so ghost steps have form of [prefix]__[stepSlug] and prefix can be __prep or __cond

for the branchPath::__gate lets make it adheer to above structure, it would be __gate__branchPath


__prep__verify ia perfectly fine -- __prep is a well known prefix, then __ as delimiter between prefix and step slug, then step slug

so we have to types of delimiters: :: and __
:: is used to nest steps behind branch prefix
__ is used to make ghost steps for given step slug

with one caveat tho - only one ghost prefix can be in the full slug,
so for example this is invalid:

__prep__branchSlug::__cond__stepSlug

you can have a __cond for stepSlug nested behind branchSlug, but it does not make sense to have it nested behind __prep__branchSlug

4. 
